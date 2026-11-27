package org.pianoml.backend.service;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Pure helpers of the error reports (issue #408): URL scrubbing, size limits and fingerprints.
 */
public final class ErrorReportSanitizer {

  public static final int MAX_URL = 2048;
  public static final int MAX_MESSAGE = 2048;
  public static final int MAX_STACK_TRACE = 32 * 1024;
  public static final int MAX_CONTEXT = 8 * 1024;
  public static final int MAX_EXCEPTION_TYPE = 255;
  public static final int MAX_USER_AGENT = 512;
  public static final int MAX_RELEASE = 100;

  /** Stack frames that make the fingerprint: enough to tell call sites apart, few enough to survive refactors */
  static final int FINGERPRINT_FRAMES = 5;

  /** Query parameters removed whatever their case */
  private static final Set<String> SENSITIVE_PARAMS = Set.of(
    "code", "key", "sig", "otp", "pwd", "jwt", "state", "email");
  /** ... and the ones whose name contains one of these */
  private static final List<String> SENSITIVE_FRAGMENTS = List.of(
    "token", "password", "passwd", "secret", "auth", "session", "signature", "apikey", "api_key", "credential");

  private static final Pattern UUID = Pattern.compile(
    "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");
  private static final Pattern NUMBER = Pattern.compile("\\d+");
  /** Line and column of a browser stack frame: "main.js:1:2345" */
  private static final Pattern LINE_COLUMN = Pattern.compile(":\\d+(:\\d+)?");
  /** Build hash of a bundle file name: "chunk-AB12CD34.js" */
  private static final Pattern BUNDLE_HASH = Pattern.compile("[-.][A-Za-z0-9]{8,}(?=\\.m?js)");
  private static final Pattern ORIGIN = Pattern.compile("[a-z][a-z0-9+.-]*://[^/\\s)]+", Pattern.CASE_INSENSITIVE);

  /**
   * Browser errors that are not stored: substrings of "ExceptionType: message". One entry per noise source,
   * each with the reason it is not a bug worth tracking.
   */
  private static final List<String> IGNORED_FRONTEND_ERRORS = List.of(
    // A tab opened before a deploy asks for a lazy chunk the new release no longer serves
    "TypeError: Failed to fetch dynamically imported module"
  );

  private ErrorReportSanitizer() {
  }

  /** Whether a browser error is known noise ({@link #IGNORED_FRONTEND_ERRORS}) and must not be stored. */
  public static boolean isIgnoredFrontendError(String exceptionType, String message) {
    String text = (exceptionType == null ? "" : exceptionType + ": ") + (message == null ? "" : message);
    return IGNORED_FRONTEND_ERRORS.stream().anyMatch(text::contains);
  }

  public static String truncate(String value, int max) {
    if (value == null) {
      return null;
    }
    return value.length() <= max ? value : value.substring(0, max);
  }

  /**
   * The URL without credentials, fragment and sensitive query parameters (tokens, passwords, codes...),
   * truncated to {@link #MAX_URL}. Works on anything, even an unparseable URL.
   */
  public static String sanitizeUrl(String url) {
    if (url == null) {
      return null;
    }
    String result = url.strip();
    int hash = result.indexOf('#');
    if (hash >= 0) {
      result = result.substring(0, hash);
    }
    // user:password@host
    result = result.replaceFirst("^([a-zA-Z][a-zA-Z0-9+.-]*://)[^/@?]*@", "$1");
    // ;jsessionid=... path parameters
    result = result.replaceAll(";[^/?]*", "");
    int question = result.indexOf('?');
    if (question >= 0) {
      String base = result.substring(0, question);
      List<String> kept = new ArrayList<>();
      for (String pair : result.substring(question + 1).split("&")) {
        if (pair.isEmpty()) {
          continue;
        }
        int eq = pair.indexOf('=');
        String name = decode(eq >= 0 ? pair.substring(0, eq) : pair).toLowerCase(Locale.ROOT);
        if (!isSensitive(name)) {
          kept.add(pair);
        }
      }
      result = kept.isEmpty() ? base : base + "?" + String.join("&", kept);
    }
    return truncate(result, MAX_URL);
  }

  static boolean isSensitive(String name) {
    return SENSITIVE_PARAMS.contains(name) || SENSITIVE_FRAGMENTS.stream().anyMatch(name::contains);
  }

  private static String decode(String value) {
    try {
      return URLDecoder.decode(value, StandardCharsets.UTF_8);
    } catch (IllegalArgumentException e) {
      return value;
    }
  }

  /**
   * The path of a URL with ids replaced, so that "/score/1b2c..." and "/score/3d4e..." group together:
   * no scheme, host, query or fragment; UUIDs become {id} and numbers {n}.
   */
  public static String normalizePath(String url) {
    if (url == null) {
      return "";
    }
    String path = ORIGIN.matcher(url).replaceFirst("");
    int end = path.length();
    for (char c : new char[]{'?', '#'}) {
      int i = path.indexOf(c);
      if (i >= 0 && i < end) {
        end = i;
      }
    }
    path = path.substring(0, end);
    path = UUID.matcher(path).replaceAll("{id}");
    return NUMBER.matcher(path).replaceAll("{n}");
  }

  /** A backend exception: root cause type and its top frames (class and method, no line), plus the path. */
  public static String fingerprint(Throwable error, String url) {
    Throwable root = error;
    while (root.getCause() != null && root.getCause() != root) {
      root = root.getCause();
    }
    StringBuilder key = new StringBuilder(root.getClass().getName());
    StackTraceElement[] frames = root.getStackTrace();
    for (int i = 0; i < Math.min(FINGERPRINT_FRAMES, frames.length); i++) {
      key.append('\n').append(frames[i].getClassName()).append('.').append(frames[i].getMethodName());
    }
    return sha256(key.append('\n').append(normalizePath(url)).toString());
  }

  /**
   * A browser error: type and top stack lines without line/column numbers, bundle hashes or origins (they
   * change with every build); the message (ids removed) when there is no stack; plus the path.
   */
  public static String fingerprint(String exceptionType, String message, String stackTrace, String url) {
    StringBuilder key = new StringBuilder(exceptionType == null ? "" : exceptionType);
    List<String> frames = new ArrayList<>();
    if (stackTrace != null) {
      for (String line : stackTrace.split("\\R")) {
        String trimmed = line.strip();
        // V8 frames start with "at", Firefox and Safari ones contain "@"
        if (trimmed.startsWith("at ") || trimmed.contains("@")) {
          frames.add(trimmed);
          if (frames.size() == FINGERPRINT_FRAMES) {
            break;
          }
        }
      }
    }
    if (frames.isEmpty()) {
      String text = message == null ? "" : message;
      key.append('\n').append(NUMBER.matcher(UUID.matcher(text).replaceAll("{id}")).replaceAll("{n}"));
    }
    for (String frame : frames) {
      String normalized = ORIGIN.matcher(frame).replaceAll("");
      normalized = LINE_COLUMN.matcher(normalized).replaceAll("");
      normalized = BUNDLE_HASH.matcher(normalized).replaceAll("");
      key.append('\n').append(normalized);
    }
    return sha256(key.append('\n').append(normalizePath(url)).toString());
  }

  /** A 5xx answered without an exception reaching the application. */
  public static String fingerprint(int status, String method, String url) {
    return sha256("HTTP " + status + "\n" + method + "\n" + normalizePath(url));
  }

  private static String sha256(String value) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }
}
