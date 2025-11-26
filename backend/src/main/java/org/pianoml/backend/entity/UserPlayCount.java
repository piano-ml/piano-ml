package org.pianoml.backend.entity;
import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDate;
import java.util.UUID;
@Entity
@Table(name = "user_play_count", schema = "pianoml")
@IdClass(UserPlayCountId.class)
@Data
public class UserPlayCount {
  @Id
  @Column(name = "user_id", nullable = false)
  private UUID userId;
  @Id
  @Column(name = "score_id", nullable = false)
  private UUID scoreId;
  @ManyToOne
  @JoinColumn(name = "user_id", insertable = false, updatable = false)
  private User user;
  @ManyToOne
  @JoinColumn(name = "score_id", insertable = false, updatable = false)
  private Score score;
  @Column(nullable = false)
  private Long count;
  @Column(name = "updated_on", nullable = false)
  private LocalDate updatedOn;
}
