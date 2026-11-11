package org.pianoml.backend.service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * Stand-ins for scripts/*2pack.sh (MuseScore, homr, pianoplayer are not available in tests), honoring their
 * contract: called as {@code <script> <INPUT> <TITLE> <COMPOSER> <MAKE_FINGERING> <TRACK_RIGHT> <TRACK_LEFT>},
 * they write {@code <INPUT without "upload_" and extension>.zip} next to the input.
 * <p>
 * Each fake also records its arguments ({@code <root>.args}, one per line) and a copy of its input
 * ({@code <root>.input}), and its zip holds {@code metadata.json} plus a {@code score.musicxml} naming the script.
 * A script named in {@code failing} exits with status 3 instead.
 */
public final class FakePackScripts {

  public static final List<String> NAMES = List.of("midi2pack.sh", "musicxml2pack.sh", "pdf2pack.sh", "image2pack.sh");

  public static final String METADATA = "{\"tracks_count\":2,\"duration_seconds\":60,\"measures_count\":12,\"tempo\":96,"
    + "\"analysis\":{\"tonic\":\"G\",\"mode\":\"major\",\"full_key\":\"G major\"},\"grade\":1.5}";

  private FakePackScripts() {
  }

  /** Writes the fake scripts into {@code dir}; returns it. */
  public static Path install(Path dir, String... failing) throws IOException {
    for (String name : NAMES) {
      boolean fails = List.of(failing).contains(name);
      Path zip = dir.resolve(name + ".result.zip");
      Files.write(zip, zip(Map.of("score.musicxml", "<score-partwise from=\"" + name + "\"/>", "metadata.json", METADATA)));
      String body = "#!/bin/sh\n"
        + "in=\"$1\"\n"
        + "root=\"${in%.*}\"\n"
        + "root=\"$(dirname \"$root\")/$(basename \"$root\" | sed 's/^upload_//')\"\n"
        + "printf '%s\\n' \"$@\" > \"$root.args\"\n"
        + "cp \"$in\" \"$root.input\"\n"
        + "echo \"fake " + name + " packing $in\"\n"
        + (fails ? "exit 3\n" : "cp \"" + zip + "\" \"$root.zip\"\n");
      Path script = dir.resolve(name);
      Files.writeString(script, body);
      script.toFile().setExecutable(true);
    }
    return dir;
  }

  public static byte[] zip(Map<String, String> entries) throws IOException {
    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
    try (ZipOutputStream zip = new ZipOutputStream(bytes)) {
      for (var entry : entries.entrySet()) {
        zip.putNextEntry(new ZipEntry(entry.getKey()));
        zip.write(entry.getValue().getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
      }
    }
    return bytes.toByteArray();
  }
}
