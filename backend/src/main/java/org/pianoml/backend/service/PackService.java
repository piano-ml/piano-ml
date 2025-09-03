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

  public String packPDF(PackScriptDto packScriptDto) throws IOException {
    File tempFile = Files.createTempFile("upload_" + packScriptDto.getId(), ".pdf").toFile();
    return runPackScript("scripts/pdf2pack.sh", tempFile, packScriptDto);
  }

  public String packMidi(PackScriptDto packScriptDto) throws IOException {
    File tempFile = Files.createTempFile("upload_" + packScriptDto.getId(), ".midi").toFile();
    return runPackScript("scripts/midi2pack.sh", tempFile, packScriptDto);
  }

  public String packMusicXml(PackScriptDto packScriptDto) throws IOException {
    File tempFile = Files.createTempFile("upload_" + packScriptDto.getId(), ".midi").toFile();
    return runPackScript("scripts/mxml2pack.sh", tempFile, packScriptDto);
  }

  private String runPackScript(String script, File tempFile,  PackScriptDto packScriptDto ) throws IOException {
    try {
      try (FileOutputStream out = new FileOutputStream(tempFile)) {
        packScriptDto.getInputStream().transferTo(out);
      }
      // Appel du script de conversion PDF -> MusicXML
      ProcessBuilder pb = new ProcessBuilder(script, tempFile.getAbsolutePath(), packScriptDto.getTitle(), packScriptDto.getComposer(), packScriptDto.getTrackRight(), packScriptDto.getTrackLeft());
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
