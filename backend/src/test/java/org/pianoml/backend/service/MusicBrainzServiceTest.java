package org.pianoml.backend.service;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.junit.jupiter.api.Assertions.*;

import java.time.LocalDate;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.pianoml.backend.entity.Author;
import org.pianoml.backend.mapper.MbAuthorApiInfoMapper;
import org.springframework.web.client.RestTemplate;

@ExtendWith(MockitoExtension.class)
public class MusicBrainzServiceTest {

  @Mock
  private RestTemplate restTemplate;

  @Mock
  private MbAuthorApiInfoMapper mapper;

  @InjectMocks
  private MusicBrainzService service;

  private final UUID sampleId = UUID.fromString("00000000-0000-0000-0000-000000000000");

  @BeforeEach
  public void setup() {
  }

  @Test
  public void parseYearMonthShouldProduceFirstOfMonth() {
    String json = "{ \"id\": \"00000000-0000-0000-0000-000000000000\", \"life-span\": { \"begin\": \"1970-12\" } }";
    when(restTemplate.getForObject(anyString(), eq(String.class))).thenReturn(json);

    // We don't need mapper to convert to Author fully; configure it to return a basic Author
    Author author = new Author();
    when(mapper.toAuthor(any())).thenReturn(author);

    Author result = service.getAuthor(sampleId);
    assertNotNull(result);
    assertNotNull(result.getLifeSpanBegin());
    assertEquals(LocalDate.of(1970, 12, 1), result.getLifeSpanBegin());
  }

  @Test
  public void parseYearOnlyShouldProduceJanFirst() {
    String json = "{ \"id\": \"00000000-0000-0000-0000-000000000000\", \"life-span\": { \"begin\": \"1970\" } }";
    when(restTemplate.getForObject(anyString(), eq(String.class))).thenReturn(json);
    Author author = new Author();
    when(mapper.toAuthor(any())).thenReturn(author);

    Author result = service.getAuthor(sampleId);
    assertNotNull(result);
    assertEquals(LocalDate.of(1970, 1, 1), result.getLifeSpanBegin());
  }

  @Test
  public void parseFullDateShouldKeepDay() {
    String json = "{ \"id\": \"00000000-0000-0000-0000-000000000000\", \"life-span\": { \"begin\": \"1970-12-15\" } }";
    when(restTemplate.getForObject(anyString(), eq(String.class))).thenReturn(json);
    Author author = new Author();
    when(mapper.toAuthor(any())).thenReturn(author);

    Author result = service.getAuthor(sampleId);
    assertNotNull(result);
    assertEquals(LocalDate.of(1970, 12, 15), result.getLifeSpanBegin());
  }

  @Test
  public void unparsableShouldYieldNull() {
    String json = "{ \"id\": \"00000000-0000-0000-0000-000000000000\", \"life-span\": { \"begin\": \"unknown\" } }";
    when(restTemplate.getForObject(anyString(), eq(String.class))).thenReturn(json);
    Author author = new Author();
    when(mapper.toAuthor(any())).thenReturn(author);

    Author result = service.getAuthor(sampleId);
    assertNotNull(result);
    assertNull(result.getLifeSpanBegin());
  }
}
