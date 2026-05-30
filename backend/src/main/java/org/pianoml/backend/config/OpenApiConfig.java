package org.pianoml.backend.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import io.swagger.v3.oas.models.servers.Server;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Configuration
public class OpenApiConfig {

  @Bean
  public OpenAPI customOpenAPI() {
    return new OpenAPI()
        .info(new Info()
            .title("PianoML API")
            .version("1.0.0")
            .description("API for PianoML application")
            .license(new License().name("GPLv3").url("https://www.gnu.org/licenses/gpl-3.0.txt")))
        .servers(List.of(
            new Server().url("https://api.pianoml.org").description("Production HTTPS server"),
            new Server().url("http://localhost:8080").description("Local HTTP server")
        ));
  }
}

