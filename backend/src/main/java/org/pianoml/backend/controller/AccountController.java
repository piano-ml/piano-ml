package org.pianoml.backend.controller;

import org.pianoml.backend.api.AccountApi;
import org.pianoml.backend.model.AccountCreatePostRequest;
import org.pianoml.backend.model.AccountLoginPost200Response;
import org.pianoml.backend.model.AccountLoginPostRequest;
import org.pianoml.backend.model.AccountPasswordResetPostRequest;
import org.pianoml.backend.model.UserApiInfo;
import org.pianoml.backend.service.AccountService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AccountController implements AccountApi {

    @Autowired
    private AccountService accountService;

    @Override
    public ResponseEntity<Void> accountCreatePost(AccountCreatePostRequest accountCreatePostRequest) {
      System.out.println(accountCreatePostRequest);
        accountService.createUser(accountCreatePostRequest);
        return new ResponseEntity<>(HttpStatus.CREATED);
    }

    @Override
    public ResponseEntity<AccountLoginPost200Response> accountLoginPost(AccountLoginPostRequest accountLoginPostRequest) {

        String token = accountService.loginUser(accountLoginPostRequest);
        AccountLoginPost200Response response = new AccountLoginPost200Response();
        response.setToken(token);
        return ResponseEntity.ok(response);
    }

    @Override
    public ResponseEntity<Void> accountCreateTokenConfirmGet(String token) {
        return new ResponseEntity<>(HttpStatus.NOT_IMPLEMENTED);
    }

    @Override
    public ResponseEntity<Void> accountLogoutGet() {
        return new ResponseEntity<>(HttpStatus.NOT_IMPLEMENTED);
    }

    @Override
    public ResponseEntity<Void> accountPasswordResetPost(AccountPasswordResetPostRequest accountPasswordResetPostRequest) {
        return new ResponseEntity<>(HttpStatus.NOT_IMPLEMENTED);
    }

    @Override
    public ResponseEntity<UserApiInfo> accountUserinfoGet() {
        return new ResponseEntity<>(HttpStatus.NOT_IMPLEMENTED);
    }

    @Override
    public ResponseEntity<UserApiInfo> accountUserinfoPut(UserApiInfo userApiInfo) {
        return new ResponseEntity<>(HttpStatus.NOT_IMPLEMENTED);
    }
}
