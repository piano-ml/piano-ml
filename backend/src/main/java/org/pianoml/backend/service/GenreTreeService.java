package org.pianoml.backend.service;

import lombok.RequiredArgsConstructor;
import org.pianoml.backend.entity.GenreTree;
import org.pianoml.backend.model.GenreTreeNodeDto;
import org.pianoml.backend.repository.GenreTreeRepository;
import org.pianoml.backend.repository.GenreRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class GenreTreeService {

  private final GenreTreeRepository genreTreeRepository;
  private final GenreRepository genreRepository; // to fetch names from Genre table

  @Transactional(readOnly = true)
  public List<GenreTreeNodeDto> getTree(Optional<UUID> rootId) {
    List<GenreTree> all = genreTreeRepository.findAll();
    Map<UUID, GenreTreeNodeDto> map = new HashMap<>();

    // create DTOs
    Set<UUID> mbids = new HashSet<>();
    for (GenreTree g : all) {
      if (g.getId() != null) mbids.add(g.getId());
    }
    Map<UUID, String> names = new HashMap<>();
    if (!mbids.isEmpty()) {
      genreRepository.findByIdIn(mbids).forEach(genre -> names.put(genre.getId(), genre.getName()));
    }

    for (GenreTree g : all) {
      GenreTreeNodeDto d = new GenreTreeNodeDto();
      d.setId(g.getId());
      d.setParent_id(g.getParent() != null ? g.getParent().getId() : null);
      // try to get name from Genre table
      // the genre_tree.genre_id stores the genre MBID, so lookup by mbid
      if (g.getId() != null) d.setName(names.get(g.getId()));
      map.put(g.getId(), d);
    }

    // attach children
    for (GenreTree g : all) {
      UUID gid = g.getId();
      GenreTreeNodeDto node = map.get(gid);
      UUID pid = node.getParent_id();
      if (pid != null) {
        GenreTreeNodeDto parent = map.get(pid);
        if (parent != null) {
          parent.getChildren().add(node);
        }
      }
    }

    List<GenreTreeNodeDto> roots = map.values().stream()
      .filter(n -> n.getParent_id() == null)
      .collect(Collectors.toList());

    if (rootId.isPresent()) {
      GenreTreeNodeDto root = map.get(rootId.get());
      return root == null ? Collections.emptyList() : List.of(root);
    }

    return roots;
  }

  @Transactional
  public UpsertResult upsertNode(UUID id, UUID parentId) {
    // basic checks
    if (parentId != null && parentId.equals(id)) {
      return UpsertResult.badRequest("parent_id equals id");
    }

    // check parent exists if provided
    GenreTree parent = null;
    if (parentId != null) {
      Optional<GenreTree> p = genreTreeRepository.findById(parentId);
      if (p.isEmpty()) {
        return UpsertResult.notFound("parent not found");
      }
      parent = p.get();
    }

    GenreTree node = genreTreeRepository.findById(id).orElse(null);
    boolean created = false;
    if (node == null) {
      node = new GenreTree();
      node.setId(id);
      created = true;
    }

    // set parent
    node.setParent(parent);

    // cycle prevention: climb parents to ensure id not in ancestry
    GenreTree cur = node.getParent();
    Set<UUID> visited = new HashSet<>();
    while (cur != null) {
      UUID gid = cur.getId();
      if (gid.equals(id)) {
        return UpsertResult.conflict("cycle detected");
      }
      if (!visited.add(gid)) {
        break; // loop in DB (defensive)
      }
      cur = cur.getParent();
    }

    GenreTree saved = genreTreeRepository.save(node);

    GenreTreeNodeDto dto = new GenreTreeNodeDto();
    dto.setId(saved.getId());
    dto.setParent_id(saved.getParent() != null ? saved.getParent().getId() : null);
    // same MBID lookup as above — resolve single name if present
    if (saved.getId() != null) {
      genreRepository.findById(saved.getId()).ifPresent(g -> dto.setName(g.getName()));
    }

    return created ? UpsertResult.created(dto) : UpsertResult.updated(dto);
  }

  public static class UpsertResult {
    public enum Status { CREATED, UPDATED, BAD_REQUEST, NOT_FOUND, CONFLICT }
    private final Status status;
    private final String message;
    private final GenreTreeNodeDto dto;

    private UpsertResult(Status s, String m, GenreTreeNodeDto d) {
      this.status = s; this.message = m; this.dto = d;
    }

    public static UpsertResult created(GenreTreeNodeDto d) { return new UpsertResult(Status.CREATED, null, d); }
    public static UpsertResult updated(GenreTreeNodeDto d) { return new UpsertResult(Status.UPDATED, null, d); }
    public static UpsertResult badRequest(String m) { return new UpsertResult(Status.BAD_REQUEST, m, null); }
    public static UpsertResult notFound(String m) { return new UpsertResult(Status.NOT_FOUND, m, null); }
    public static UpsertResult conflict(String m) { return new UpsertResult(Status.CONFLICT, m, null); }

    public Status getStatus() { return status; }
    public String getMessage() { return message; }
    public GenreTreeNodeDto getDto() { return dto; }
  }
}
