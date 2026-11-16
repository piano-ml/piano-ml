package org.pianoml.backend.coach.tools;

import org.pianoml.backend.coach.CoachArgs;
import org.pianoml.backend.coach.CoachToolHandler;
import org.pianoml.backend.model.PracticeItemStats;
import org.pianoml.backend.security.GrantPrincipal;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

/** Tool 4, list_practiced_items. */
@Component
public class ListPracticedItemsTool implements CoachToolHandler {

  private final CoachRows rows;
  private final PracticeData practice;

  public ListPracticedItemsTool(CoachRows rows, PracticeData practice) {
    this.rows = rows;
    this.practice = practice;
  }

  @Override
  public String name() {
    return "list_practiced_items";
  }

  @Override
  public Object execute(GrantPrincipal principal, Map<String, Object> arguments) {
    CoachArgs args = new CoachArgs(arguments);
    String kind = args.string("kind");
    String sort = args.has("sort") ? args.string("sort") : "recent";
    int limit = args.integer("limit", 10);
    int offset = args.integer("offset", 0);

    List<PracticeItemStats> all = practice.summary(rows.user(principal), null).getItems();
    Stream<PracticeItemStats> items = (all == null ? List.<PracticeItemStats>of() : all).stream()
      .filter(i -> kind == null || kind.equals(i.getKind()));
    Comparator<OffsetDateTime> dates = Comparator.nullsLast(Comparator.naturalOrder());
    items = switch (sort) {
      case "weakest" -> items.filter(i -> i.getLastAccuracy() != null).sorted(Comparator.comparing(PracticeItemStats::getLastAccuracy));
      case "most_practiced" -> items.sorted(Comparator.comparing((PracticeItemStats i) -> i.getActiveSeconds() == null ? 0L : i.getActiveSeconds()).reversed());
      case "best" -> items.filter(i -> i.getBestAccuracy() != null).sorted(Comparator.comparing(PracticeItemStats::getBestAccuracy).reversed());
      case "stale" -> items.filter(i -> Boolean.TRUE.equals(i.getStale())).sorted(Comparator.comparing(PracticeItemStats::getLastPlayedAt, dates));
      default -> items.sorted(Comparator.comparing(PracticeItemStats::getLastPlayedAt, Comparator.nullsLast(Comparator.<OffsetDateTime>reverseOrder())));
    };
    List<PracticeItemStats> sorted = items.toList();

    Map<String, Object> data = new LinkedHashMap<>();
    data.put("items", sorted.stream().skip(offset).limit(limit).map(rows::itemRow).toList());
    data.put("total", sorted.size());
    data.put("hasMore", offset + limit < sorted.size());
    return data;
  }
}
