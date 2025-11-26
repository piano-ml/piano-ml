package org.pianoml.backend.entity;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class UserPlayCountId implements Serializable {

  private UUID userId;
  private UUID scoreId;

  @Override
  public boolean equals(Object o) {
    if (this == o) return true;
    if (o == null || getClass() != o.getClass()) return false;
    UserPlayCountId that = (UserPlayCountId) o;
    return userId.equals(that.userId) && scoreId.equals(that.scoreId);
  }

  @Override
  public int hashCode() {
    return 31 * userId.hashCode() + scoreId.hashCode();
  }
}

