package org.pianoml.backend.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;

@Service
@Slf4j
public class PackService {

  public String packPDF(String id, InputStream inputStream, String title, String composer) throws IOException {
    File tempPdf = Files.createTempFile("upload_" + id, ".pdf").toFile();
    return runPackScript("scripts/pdf2pack.sh", tempPdf, inputStream, title, composer);
  }

  public String packMidi(String id, InputStream inputStream, String title, String composer) throws IOException {
    File tempPdf = Files.createTempFile("upload_" + id, ".midi").toFile();
    return runPackScript("scripts/midi2pack.sh", tempPdf, inputStream, title, composer);
  }


  public String packMusicXml(String id, InputStream inputStream, String title, String composer) throws IOException {
    File tempPdf = Files.createTempFile("upload_" + id, ".midi").toFile();
    return runPackScript("scripts/midi2pack.sh", tempPdf, inputStream, title, composer);
  }


  private String runPackScript(String script, File tempFile,  InputStream inputStream, String title, String composer) {
    try {
      try (FileOutputStream out = new FileOutputStream(tempFile)) {
        inputStream.transferTo(out);
      }
      // Appel du script de conversion PDF -> MusicXML
      ProcessBuilder pb = new ProcessBuilder(script, tempFile.getAbsolutePath(), title, composer);
      pb.redirectErrorStream(true);
      Process process = pb.start();
      try (java.io.BufferedReader reader = new java.io.BufferedReader(new java.io.InputStreamReader(process.getInputStream()))) {
        String line;
        while ((line = reader.readLine()) != null) {
          log.info(line);
        }
      }
      int exitCode = process.waitFor();
      if (exitCode != 0) {
        throw new RuntimeException("Error during packing with " + script);
      }
      return tempFile.getAbsolutePath().replace("upload_", "").split("\\.")[0] + ".zip";
    } catch (IOException | InterruptedException e) {
      throw new RuntimeException("Error during packing", e);
    } finally {
      if (tempFile != null && tempFile.exists()) {
        tempFile.delete();
      }
    }
  }

}
