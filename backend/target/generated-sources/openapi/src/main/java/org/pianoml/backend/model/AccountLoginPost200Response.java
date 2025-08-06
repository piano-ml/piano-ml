package org.pianoml.backend.model;

import java.net.URI;
import java.util.Objects;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonTypeName;
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
 * AccountLoginPost200Response
 */

@JsonTypeName("_account_login_post_200_response")
@Generated(value = "org.openapitools.codegen.languages.SpringCodegen", date = "2025-08-06T14:23:40.684288203Z[Etc/UTC]", comments = "Generator version: 7.5.0")
public class AccountLoginPost200Response {

  private String token;

  @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
  private OffsetDateTime expire;

  public AccountLoginPost200Response token(String token) {
    this.token = token;
    return this;
  }

  /**
   * Get token
   * @return token
  */

  @Schema(name = "token", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
  @JsonProperty("token")
  public String getToken() {
    return token;
  }

  public void setToken(String token) {
    this.token = token;
  }

  public AccountLoginPost200Response expire(OffsetDateTime expire) {
    this.expire = expire;
    return this;
  }

  /**
   * Get expire
   * @return expire
  */
  @Valid
  @Schema(name = "expire", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
  @JsonProperty("expire")
  public OffsetDateTime getExpire() {
    return expire;
  }

  public void setExpire(OffsetDateTime expire) {
    this.expire = expire;
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) {
      return true;
    }
    if (o == null || getClass() != o.getClass()) {
      return false;
    }
    AccountLoginPost200Response accountLoginPost200Response = (AccountLoginPost200Response) o;
    return Objects.equals(this.token, accountLoginPost200Response.token) &&
        Objects.equals(this.expire, accountLoginPost200Response.expire);
  }

  @Override
  public int hashCode() {
    return Objects.hash(token, expire);
  }

  @Override
  public String toString() {
    StringBuilder sb = new StringBuilder();
    sb.append("class AccountLoginPost200Response {\n");
    sb.append("    token: ").append(toIndentedString(token)).append("\n");
    sb.append("    expire: ").append(toIndentedString(expire)).append("\n");
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
