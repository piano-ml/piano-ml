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
 * AuthorApiInfo
 */

@Generated(value = "org.openapitools.codegen.languages.SpringCodegen", date = "2025-08-06T17:29:55.723979095+02:00[Europe/Paris]", comments = "Generator version: 7.5.0")
public class AuthorApiInfo {

  private String id;

  private String name;

  @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
  private OffsetDateTime birth;

  private String bio;

  private URI image;

  private URI link;

  public AuthorApiInfo() {
    super();
  }

  /**
   * Constructor with only required parameters
   */
  public AuthorApiInfo(String id, String name, String bio) {
    this.id = id;
    this.name = name;
    this.bio = bio;
  }

  public AuthorApiInfo id(String id) {
    this.id = id;
    return this;
  }

  /**
   * Get id
   * @return id
  */
  @NotNull 
  @Schema(name = "id", requiredMode = Schema.RequiredMode.REQUIRED)
  @JsonProperty("id")
  public String getId() {
    return id;
  }

  public void setId(String id) {
    this.id = id;
  }

  public AuthorApiInfo name(String name) {
    this.name = name;
    return this;
  }

  /**
   * Get name
   * @return name
  */
  @NotNull 
  @Schema(name = "name", requiredMode = Schema.RequiredMode.REQUIRED)
  @JsonProperty("name")
  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public AuthorApiInfo birth(OffsetDateTime birth) {
    this.birth = birth;
    return this;
  }

  /**
   * Get birth
   * @return birth
  */
  @Valid 
  @Schema(name = "birth", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
  @JsonProperty("birth")
  public OffsetDateTime getBirth() {
    return birth;
  }

  public void setBirth(OffsetDateTime birth) {
    this.birth = birth;
  }

  public AuthorApiInfo bio(String bio) {
    this.bio = bio;
    return this;
  }

  /**
   * Get bio
   * @return bio
  */
  @NotNull 
  @Schema(name = "bio", requiredMode = Schema.RequiredMode.REQUIRED)
  @JsonProperty("bio")
  public String getBio() {
    return bio;
  }

  public void setBio(String bio) {
    this.bio = bio;
  }

  public AuthorApiInfo image(URI image) {
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

  public AuthorApiInfo link(URI link) {
    this.link = link;
    return this;
  }

  /**
   * Get link
   * @return link
  */
  @Valid 
  @Schema(name = "link", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
  @JsonProperty("link")
  public URI getLink() {
    return link;
  }

  public void setLink(URI link) {
    this.link = link;
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) {
      return true;
    }
    if (o == null || getClass() != o.getClass()) {
      return false;
    }
    AuthorApiInfo authorApiInfo = (AuthorApiInfo) o;
    return Objects.equals(this.id, authorApiInfo.id) &&
        Objects.equals(this.name, authorApiInfo.name) &&
        Objects.equals(this.birth, authorApiInfo.birth) &&
        Objects.equals(this.bio, authorApiInfo.bio) &&
        Objects.equals(this.image, authorApiInfo.image) &&
        Objects.equals(this.link, authorApiInfo.link);
  }

  @Override
  public int hashCode() {
    return Objects.hash(id, name, birth, bio, image, link);
  }

  @Override
  public String toString() {
    StringBuilder sb = new StringBuilder();
    sb.append("class AuthorApiInfo {\n");
    sb.append("    id: ").append(toIndentedString(id)).append("\n");
    sb.append("    name: ").append(toIndentedString(name)).append("\n");
    sb.append("    birth: ").append(toIndentedString(birth)).append("\n");
    sb.append("    bio: ").append(toIndentedString(bio)).append("\n");
    sb.append("    image: ").append(toIndentedString(image)).append("\n");
    sb.append("    link: ").append(toIndentedString(link)).append("\n");
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

