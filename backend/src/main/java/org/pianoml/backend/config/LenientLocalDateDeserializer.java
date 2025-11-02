package org.pianoml.backend.config;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import java.io.IOException;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Lenient deserializer for LocalDate coming from MusicBrainz API.
 * Accepts formats:
 * - yyyy
 * - yyyy-MM
 * - yyyy-MM-dd
 * If unparsable, returns null (and logs a warning).
 */
public class LenientLocalDateDeserializer extends JsonDeserializer<LocalDate> {
  private static final Logger log = LoggerFactory.getLogger(LenientLocalDateDeserializer.class);
  private static final DateTimeFormatter YEAR_MONTH_FMT = DateTimeFormatter.ofPattern("yyyy-MM");

  @Override
  public LocalDate deserialize(JsonParser p, DeserializationContext ctxt) throws IOException {
    String text = p.getText();
    if (text == null) {
      return null;
    }
    text = text.trim();
    if (text.isEmpty()) {
      return null;
    }

    try {
      // Year only: "1970"
      if (text.length() == 4 && text.chars().allMatch(Character::isDigit)) {
        int y = Integer.parseInt(text);
        return LocalDate.of(y, 1, 1);
      }
      // Year-Month: "1970-12"
      if (text.length() == 7 && text.charAt(4) == '-') {
        YearMonth ym = YearMonth.parse(text, YEAR_MONTH_FMT);
        return LocalDate.of(ym.getYear(), ym.getMonthValue(), 1);
      }
      // Default attempt: ISO LocalDate (yyyy-MM-dd)
      return LocalDate.parse(text);
    } catch (DateTimeParseException | NumberFormatException ex) {
      log.warn("LenientLocalDateDeserializer: could not parse date '{}', returning null", text, ex);
      return null;
    }
  }
}

