package org.pianoml.backend.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Test-only endpoints that fail in the ways the error reports must (or must not) record. */
@RestController
class ErrorReportTestController {

  @GetMapping("/test-only/error-report/boom")
  String boom() {
    throw new IllegalStateException("kaboom from the test controller");
  }

  @GetMapping("/test-only/error-report/bad-request")
  String badRequest() {
    throw new IllegalArgumentException("expected 400 from the test controller");
  }

  @GetMapping("/test-only/error-report/unavailable")
  ResponseEntity<String> unavailable() {
    return ResponseEntity.status(503).body("down");
  }
}
