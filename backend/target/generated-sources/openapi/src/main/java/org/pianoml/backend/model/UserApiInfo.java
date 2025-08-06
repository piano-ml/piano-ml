package org.pianoml.backend.model;

import java.net.URI;
import java.util.Objects;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonCreator;
import java.net.URI;
import org.openapitools.jackson.nullable.JsonNullable;
import java.time.OffsetDateTime;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import io.swagger.v3.oas.annotations.media.Schema;


import java.util.*;
import jakarta.annotation.Generated;

/**
 * UserApiInfo
 */

@Generated(value = "org.openapitools.codegen.languages.SpringCodegen", date = "2025-08-06T17:29:55.723979095+02:00[Europe/Paris]", comments = "Generator version: 7.5.0")
public class UserApiInfo {

  private String email;

  private String name;

  private String url;

  private URI bio;

  private URI image;

  public UserApiInfo() {
    super();
  }

  /**
   * Constructor with only required parameters
   */
  public UserApiInfo(String email, String name) {
    this.email = email;
    this.name = name;
  }

  public UserApiInfo email(String email) {
    this.email = email;
    return this;
  }

  /**
   * Get email
   * @return email
  */
  @NotNull @jakarta.validation.constraints.Email 
  @Schema(name = "email", requiredMode = Schema.RequiredMode.REQUIRED)
  @JsonProperty("email")
  public String getEmail() {
    return email;
  }

  public void setEmail(String email) {
    this.email = email;
  }

  public UserApiInfo name(String name) {
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

  public UserApiInfo url(String url) {
    this.url = url;
    return this;
  }

  /**
   * Get url
   * @return url
  */
  
  @Schema(name = "url", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
  @JsonProperty("url")
  public String getUrl() {
    return url;
  }

  public void setUrl(String url) {
    this.url = url;
  }

  public UserApiInfo bio(URI bio) {
    this.bio = bio;
    return this;
  }

  /**
   * Get bio
   * @return bio
  */
  @Valid 
  @Schema(name = "bio", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
  @JsonProperty("bio")
  public URI getBio() {
    return bio;
  }

  public void setBio(URI bio) {
    this.bio = bio;
  }

  public UserApiInfo image(URI image) {
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
    UserApiInfo userApiInfo = (UserApiInfo) o;
    return Objects.equals(this.email, userApiInfo.email) &&
        Objects.equals(this.name, userApiInfo.name) &&
        Objects.equals(this.url, userApiInfo.url) &&
        Objects.equals(this.bio, userApiInfo.bio) &&
        Objects.equals(this.image, userApiInfo.image);
  }

  @Override
  public int hashCode() {
    return Objects.hash(email, name, url, bio, image);
  }

  @Override
  public String toString() {
    StringBuilder sb = new StringBuilder();
    sb.append("class UserApiInfo {\n");
    sb.append("    email: ").append(toIndentedString(email)).append("\n");
    sb.append("    name: ").append(toIndentedString(name)).append("\n");
    sb.append("    url: ").append(toIndentedString(url)).append("\n");
    sb.append("    bio: ").append(toIndentedString(bio)).append("\n");
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

