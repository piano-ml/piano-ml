package org.pianoml.backend.model;

import java.net.URI;
import java.util.Objects;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonCreator;
import java.net.URI;
import java.time.OffsetDateTime;
import org.springframework.format.annotation.DateTimeFormat;
import org.openapitools.jackson.nullable.JsonNullable;
import java.time.OffsetDateTime;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import io.swagger.v3.oas.annotations.media.Schema;


import java.util.*;
import jakarta.annotation.Generated;

/**
 * ScoreApiInfo
 */

@Generated(value = "org.openapitools.codegen.languages.SpringCodegen", date = "2025-08-06T17:29:55.723979095+02:00[Europe/Paris]", comments = "Generator version: 7.5.0")
public class ScoreApiInfo {

  private String id;

  private String title;

  private String author;

  private String authorId;

  private Integer version;

  private Integer year;

  private Integer tracksCount;

  private Boolean handSeparated;

  private Boolean hasLyrics;

  private Integer measures;

  private Float duration;

  private String genre;

  private String genreId;

  private Integer grade;

  @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
  private OffsetDateTime uploadedAt;

  private String uploadedById;

  private String uploadedByName;

  @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
  private OffsetDateTime updatedAt;

  private Boolean hasMxml;

  private Boolean hasPdf;

  private URI image;

  public ScoreApiInfo() {
    super();
  }

  /**
   * Constructor with only required parameters
   */
  public ScoreApiInfo(String title, String author, Integer year) {
    this.title = title;
    this.author = author;
    this.year = year;
  }

  public ScoreApiInfo id(String id) {
    this.id = id;
    return this;
  }

  /**
   * Get id
   * @return id
  */
  
  @Schema(name = "id", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
  @JsonProperty("id")
  public String getId() {
    return id;
  }

  public void setId(String id) {
    this.id = id;
  }

  public ScoreApiInfo title(String title) {
    this.title = title;
    return this;
  }

  /**
   * Get title
   * @return title
  */
  @NotNull 
  @Schema(name = "title", requiredMode = Schema.RequiredMode.REQUIRED)
  @JsonProperty("title")
  public String getTitle() {
    return title;
  }

  public void setTitle(String title) {
    this.title = title;
  }

  public ScoreApiInfo author(String author) {
    this.author = author;
    return this;
  }

  /**
   * Get author
   * @return author
  */
  @NotNull 
  @Schema(name = "author", requiredMode = Schema.RequiredMode.REQUIRED)
  @JsonProperty("author")
  public String getAuthor() {
    return author;
  }

  public void setAuthor(String author) {
    this.author = author;
  }

  public ScoreApiInfo authorId(String authorId) {
    this.authorId = authorId;
    return this;
  }

  /**
   * Get authorId
   * @return authorId
  */
  
  @Schema(name = "author_id", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
  @JsonProperty("author_id")
  public String getAuthorId() {
    return authorId;
  }

  public void setAuthorId(String authorId) {
    this.authorId = authorId;
  }

  public ScoreApiInfo version(Integer version) {
    this.version = version;
    return this;
  }

  /**
   * Get version
   * @return version
  */
  
  @Schema(name = "version", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
  @JsonProperty("version")
  public Integer getVersion() {
    return version;
  }

  public void setVersion(Integer version) {
    this.version = version;
  }

  public ScoreApiInfo year(Integer year) {
    this.year = year;
    return this;
  }

  /**
   * Get year
   * @return year
  */
  @NotNull 
  @Schema(name = "year", requiredMode = Schema.RequiredMode.REQUIRED)
  @JsonProperty("year")
  public Integer getYear() {
    return year;
  }

  public void setYear(Integer year) {
    this.year = year;
  }

  public ScoreApiInfo tracksCount(Integer tracksCount) {
    this.tracksCount = tracksCount;
    return this;
  }

  /**
   * Get tracksCount
   * @return tracksCount
  */
  
  @Schema(name = "tracks_count", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
  @JsonProperty("tracks_count")
  public Integer getTracksCount() {
    return tracksCount;
  }

  public void setTracksCount(Integer tracksCount) {
    this.tracksCount = tracksCount;
  }

  public ScoreApiInfo handSeparated(Boolean handSeparated) {
    this.handSeparated = handSeparated;
    return this;
  }

  /**
   * Get handSeparated
   * @return handSeparated
  */
  
  @Schema(name = "hand_separated", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
  @JsonProperty("hand_separated")
  public Boolean getHandSeparated() {
    return handSeparated;
  }

  public void setHandSeparated(Boolean handSeparated) {
    this.handSeparated = handSeparated;
  }

  public ScoreApiInfo hasLyrics(Boolean hasLyrics) {
    this.hasLyrics = hasLyrics;
    return this;
  }

  /**
   * Get hasLyrics
   * @return hasLyrics
  */
  
  @Schema(name = "has_lyrics", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
  @JsonProperty("has_lyrics")
  public Boolean getHasLyrics() {
    return hasLyrics;
  }

  public void setHasLyrics(Boolean hasLyrics) {
    this.hasLyrics = hasLyrics;
  }

  public ScoreApiInfo measures(Integer measures) {
    this.measures = measures;
    return this;
  }

  /**
   * Get measures
   * @return measures
  */
  
  @Schema(name = "measures", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
  @JsonProperty("measures")
  public Integer getMeasures() {
    return measures;
  }

  public void setMeasures(Integer measures) {
    this.measures = measures;
  }

  public ScoreApiInfo duration(Float duration) {
    this.duration = duration;
    return this;
  }

  /**
   * Get duration
   * @return duration
  */
  
  @Schema(name = "duration", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
  @JsonProperty("duration")
  public Float getDuration() {
    return duration;
  }

  public void setDuration(Float duration) {
    this.duration = duration;
  }

  public ScoreApiInfo genre(String genre) {
    this.genre = genre;
    return this;
  }

  /**
   * Get genre
   * @return genre
  */
  
  @Schema(name = "genre", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
  @JsonProperty("genre")
  public String getGenre() {
    return genre;
  }

  public void setGenre(String genre) {
    this.genre = genre;
  }

  public ScoreApiInfo genreId(String genreId) {
    this.genreId = genreId;
    return this;
  }

  /**
   * Get genreId
   * @return genreId
  */
  
  @Schema(name = "genre_id", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
  @JsonProperty("genre_id")
  public String getGenreId() {
    return genreId;
  }

  public void setGenreId(String genreId) {
    this.genreId = genreId;
  }

  public ScoreApiInfo grade(Integer grade) {
    this.grade = grade;
    return this;
  }

  /**
   * Get grade
   * @return grade
  */
  
  @Schema(name = "grade", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
  @JsonProperty("grade")
  public Integer getGrade() {
    return grade;
  }

  public void setGrade(Integer grade) {
    this.grade = grade;
  }

  public ScoreApiInfo uploadedAt(OffsetDateTime uploadedAt) {
    this.uploadedAt = uploadedAt;
    return this;
  }

  /**
   * Get uploadedAt
   * @return uploadedAt
  */
  @Valid 
  @Schema(name = "uploaded_at", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
  @JsonProperty("uploaded_at")
  public OffsetDateTime getUploadedAt() {
    return uploadedAt;
  }

  public void setUploadedAt(OffsetDateTime uploadedAt) {
    this.uploadedAt = uploadedAt;
  }

  public ScoreApiInfo uploadedById(String uploadedById) {
    this.uploadedById = uploadedById;
    return this;
  }

  /**
   * Get uploadedById
   * @return uploadedById
  */
  
  @Schema(name = "uploaded_by_id", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
  @JsonProperty("uploaded_by_id")
  public String getUploadedById() {
    return uploadedById;
  }

  public void setUploadedById(String uploadedById) {
    this.uploadedById = uploadedById;
  }

  public ScoreApiInfo uploadedByName(String uploadedByName) {
    this.uploadedByName = uploadedByName;
    return this;
  }

  /**
   * Get uploadedByName
   * @return uploadedByName
  */
  
  @Schema(name = "uploaded_by_name", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
  @JsonProperty("uploaded_by_name")
  public String getUploadedByName() {
    return uploadedByName;
  }

  public void setUploadedByName(String uploadedByName) {
    this.uploadedByName = uploadedByName;
  }

  public ScoreApiInfo updatedAt(OffsetDateTime updatedAt) {
    this.updatedAt = updatedAt;
    return this;
  }

  /**
   * Get updatedAt
   * @return updatedAt
  */
  @Valid 
  @Schema(name = "updated_at", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
  @JsonProperty("updated_at")
  public OffsetDateTime getUpdatedAt() {
    return updatedAt;
  }

  public void setUpdatedAt(OffsetDateTime updatedAt) {
    this.updatedAt = updatedAt;
  }

  public ScoreApiInfo hasMxml(Boolean hasMxml) {
    this.hasMxml = hasMxml;
    return this;
  }

  /**
   * Get hasMxml
   * @return hasMxml
  */
  
  @Schema(name = "has_mxml", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
  @JsonProperty("has_mxml")
  public Boolean getHasMxml() {
    return hasMxml;
  }

  public void setHasMxml(Boolean hasMxml) {
    this.hasMxml = hasMxml;
  }

  public ScoreApiInfo hasPdf(Boolean hasPdf) {
    this.hasPdf = hasPdf;
    return this;
  }

  /**
   * Get hasPdf
   * @return hasPdf
  */
  
  @Schema(name = "has_pdf", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
  @JsonProperty("has_pdf")
  public Boolean getHasPdf() {
    return hasPdf;
  }

  public void setHasPdf(Boolean hasPdf) {
    this.hasPdf = hasPdf;
  }

  public ScoreApiInfo image(URI image) {
    this.image = image;
    return this;
  }

  /**
   * Get image
   * @return image
  */
  @Valid 
  @Schema(name = "image", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
  @JsonProperty("image")
  public URI getImage() {
    return image;
  }

  public void setImage(URI image) {
    this.image = image;
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) {
      return true;
    }
    if (o == null || getClass() != o.getClass()) {
      return false;
    }
    ScoreApiInfo scoreApiInfo = (ScoreApiInfo) o;
    return Objects.equals(this.id, scoreApiInfo.id) &&
        Objects.equals(this.title, scoreApiInfo.title) &&
        Objects.equals(this.author, scoreApiInfo.author) &&
        Objects.equals(this.authorId, scoreApiInfo.authorId) &&
        Objects.equals(this.version, scoreApiInfo.version) &&
        Objects.equals(this.year, scoreApiInfo.year) &&
        Objects.equals(this.tracksCount, scoreApiInfo.tracksCount) &&
        Objects.equals(this.handSeparated, scoreApiInfo.handSeparated) &&
        Objects.equals(this.hasLyrics, scoreApiInfo.hasLyrics) &&
        Objects.equals(this.measures, scoreApiInfo.measures) &&
        Objects.equals(this.duration, scoreApiInfo.duration) &&
        Objects.equals(this.genre, scoreApiInfo.genre) &&
        Objects.equals(this.genreId, scoreApiInfo.genreId) &&
        Objects.equals(this.grade, scoreApiInfo.grade) &&
        Objects.equals(this.uploadedAt, scoreApiInfo.uploadedAt) &&
        Objects.equals(this.uploadedById, scoreApiInfo.uploadedById) &&
        Objects.equals(this.uploadedByName, scoreApiInfo.uploadedByName) &&
        Objects.equals(this.updatedAt, scoreApiInfo.updatedAt) &&
        Objects.equals(this.hasMxml, scoreApiInfo.hasMxml) &&
        Objects.equals(this.hasPdf, scoreApiInfo.hasPdf) &&
        Objects.equals(this.image, scoreApiInfo.image);
  }

  @Override
  public int hashCode() {
    return Objects.hash(id, title, author, authorId, version, year, tracksCount, handSeparated, hasLyrics, measures, duration, genre, genreId, grade, uploadedAt, uploadedById, uploadedByName, updatedAt, hasMxml, hasPdf, image);
  }

  @Override
  public String toString() {
    StringBuilder sb = new StringBuilder();
    sb.append("class ScoreApiInfo {\n");
    sb.append("    id: ").append(toIndentedString(id)).append("\n");
    sb.append("    title: ").append(toIndentedString(title)).append("\n");
    sb.append("    author: ").append(toIndentedString(author)).append("\n");
    sb.append("    authorId: ").append(toIndentedString(authorId)).append("\n");
    sb.append("    version: ").append(toIndentedString(version)).append("\n");
    sb.append("    year: ").append(toIndentedString(year)).append("\n");
    sb.append("    tracksCount: ").append(toIndentedString(tracksCount)).append("\n");
    sb.append("    handSeparated: ").append(toIndentedString(handSeparated)).append("\n");
    sb.append("    hasLyrics: ").append(toIndentedString(hasLyrics)).append("\n");
    sb.append("    measures: ").append(toIndentedString(measures)).append("\n");
    sb.append("    duration: ").append(toIndentedString(duration)).append("\n");
    sb.append("    genre: ").append(toIndentedString(genre)).append("\n");
    sb.append("    genreId: ").append(toIndentedString(genreId)).append("\n");
    sb.append("    grade: ").append(toIndentedString(grade)).append("\n");
    sb.append("    uploadedAt: ").append(toIndentedString(uploadedAt)).append("\n");
    sb.append("    uploadedById: ").append(toIndentedString(uploadedById)).append("\n");
    sb.append("    uploadedByName: ").append(toIndentedString(uploadedByName)).append("\n");
    sb.append("    updatedAt: ").append(toIndentedString(updatedAt)).append("\n");
    sb.append("    hasMxml: ").append(toIndentedString(hasMxml)).append("\n");
    sb.append("    hasPdf: ").append(toIndentedString(hasPdf)).append("\n");
    sb.append("    image: ").append(toIndentedString(image)).append("\n");
    sb.append("}");
    return sb.toString();
  }

  /**
   * Convert the given object to string with each line indented by 4 spaces
   * (except the first line).
   */
  private String toIndentedString(Object o) {
    if (o == null) {
      return "null";
    }
    return o.toString().replace("\n", "\n    ");
  }
}

