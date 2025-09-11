package org.pianoml.backend.service;

import lombok.Data;
import org.pianoml.backend.entity.Score;

import java.io.InputStream;

@Data
public class PackScriptDto {
  String id;
  String mbid;
  InputStream inputStream;
  String title;
  String composer;
  String trackRight="";
  String trackLeft="";
  boolean splitTracks=false;

  public PackScriptDto(InputStream inputStream, Score score) {
    this.id=score.getId().toString();
    this.mbid=score.getMbid().toString();
    this.inputStream=inputStream;
    this.title=score.getTitle();
    this.composer=score.getAuthor().getName();
    String[] tracks = score.getStudyTracks().split(",");
    if (tracks.length == 2) {
      this.trackRight = tracks[0];
      this.trackLeft = tracks[1];
    } else if (tracks.length == 1) {
      this.trackRight = tracks[0];
    }
    this.splitTracks = score.getHandSeparated();
  }
}
