package org.pianoml.backend.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;

import static org.junit.jupiter.api.Assertions.assertEquals;

class PackServiceAddOriginalTest {

  @TempDir
  Path dir;

  @Test
  void addsOriginalAlongsideGeneratedEntries() throws IOException {
    Path zip = dir.resolve("score.zip");
    try (ZipOutputStream zos = new ZipOutputStream(new FileOutputStream(zip.toFile()))) {
      zos.putNextEntry(new ZipEntry("score.musicxml"));
      zos.write("<generated/>".getBytes(StandardCharsets.UTF_8));
      zos.closeEntry();
    }
    Path original = Files.writeString(dir.resolve("upload.midi"), "original-bytes");

    PackService.addOriginalToZip(zip, original, "ori.midi");

    Map<String, String> entries = new HashMap<>();
    try (ZipFile zf = new ZipFile(zip.toFile())) {
      zf.stream().forEach(e -> {
        try {
          entries.put(e.getName(), new String(zf.getInputStream(e).readAllBytes(), StandardCharsets.UTF_8));
        } catch (IOException ex) {
          throw new RuntimeException(ex);
        }
      });
    }
    assertEquals(Map.of("score.musicxml", "<generated/>", "ori.midi", "original-bytes"), entries);
  }
}
