package org.pianoml.backend.service;

import lombok.Data;
import org.pianoml.backend.entity.Score;

import java.io.InputStream;

@Data
public class PackScriptDto {
  String id;
  InputStream inputStream;
  String title;
  String composer;
  String trackRight = "";
  String trackLeft = "";
  String type;
  Boolean makeFingerings = true;

  public PackScriptDto(InputStream inputStream, Score score, String type,  boolean makeFingerings) {
    this.makeFingerings = makeFingerings;
    this.id = score.getId().toString();
    this.type = type;
    //this.mbid = score.getMbid().toString();
    this.inputStream = inputStream;
    this.title = score.getTitle();
    this.composer = score.getAuthor().getName();
    String[] tracks = score.getStudyTracks().split(",");
    if (tracks.length == 2) {
      this.trackRight = tracks[0];
      this.trackLeft = tracks[1];
    } else if (tracks.length == 1) {
      this.trackRight = tracks[0];
    }
    //this.splitTracks = score.getHandSeparated();
  }

  public String getExtension() {
    if (type.equals("pdf")) {
      return ".pdf";
    } else if (type.equals("image")) {
      return ".png";
    } else if (type.equals("musicxml")) {
      return  ".musicxml";
    } else if (type.equals("mxl")) {
      return ".mxl";
    } else if (type.equals("midi")) {
      return ".midi";
  }
    else {
      throw new IllegalArgumentException("Unsupported type for packing: " + type);
    }
  }
}
