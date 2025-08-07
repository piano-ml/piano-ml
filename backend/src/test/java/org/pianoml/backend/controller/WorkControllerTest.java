package org.pianoml.backend.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.pianoml.backend.model.AllWorksApiInfo;
import org.pianoml.backend.service.MusicBrainzService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
public class WorkControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private MusicBrainzService musicBrainzService;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    public void testSearchWorks() throws Exception {
        AllWorksApiInfo works = new AllWorksApiInfo();
        given(musicBrainzService.searchWorks("test")).willReturn(works);

        mockMvc.perform(get("/work/search/test"))
                .andExpect(status().isOk());
    }
}
