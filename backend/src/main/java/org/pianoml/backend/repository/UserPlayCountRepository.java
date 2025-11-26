package org.pianoml.backend.repository;

import org.pianoml.backend.entity.UserPlayCount;
import org.pianoml.backend.entity.UserPlayCountId;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.CrudRepository;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Repository
public interface UserPlayCountRepository extends CrudRepository<UserPlayCount, UserPlayCountId> {

  /**
   * Incrémente le compteur de lecture pour un utilisateur et un score donnés.
   * Si l'entrée n'existe pas, elle est créée avec count=1.
   * Si elle existe déjà, le count est incrémenté de 1 et updated_on est mis à jour.
   *
   * @param userId  L'ID de l'utilisateur
   * @param scoreId L'ID du score
   */
  @Transactional
  @Modifying
  @Query(value = """
      INSERT INTO pianoml.user_play_count (user_id, score_id, count, updated_on)
      VALUES (:userId, :scoreId, 1, CURRENT_DATE)
      ON CONFLICT (user_id, score_id)
      DO UPDATE SET
        count = pianoml.user_play_count.count + 1,
        updated_on = CURRENT_DATE
      """, nativeQuery = true)
  void incrementPlayCount(@Param("userId") UUID userId, @Param("scoreId") UUID scoreId);
}

