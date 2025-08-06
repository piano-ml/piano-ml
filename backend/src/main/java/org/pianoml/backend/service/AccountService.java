package org.pianoml.backend.service;

import org.pianoml.backend.entity.User;
import org.pianoml.backend.mapper.UserMapper;
import org.pianoml.backend.model.AccountCreatePostRequest;
import org.pianoml.backend.exception.UserAlreadyExistsException;
import org.pianoml.backend.model.AccountLoginPostRequest;
import org.pianoml.backend.repository.UserRepository;
import org.pianoml.backend.security.JwtTokenProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AccountService {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private AuthenticationManager authenticationManager;

    @Autowired
    private JwtTokenProvider tokenProvider;

    @Autowired
    private UserMapper userMapper;

    public User createUser(AccountCreatePostRequest accountCreatePostRequest) {
        if (userRepository.findByEmail(accountCreatePostRequest.getEmail()).isPresent()) {
            throw new UserAlreadyExistsException("User with email " + accountCreatePostRequest.getEmail() + " already exists.");
        }

        User user = userMapper.toUser(accountCreatePostRequest);
        user.setPassword(passwordEncoder.encode(accountCreatePostRequest.getPassword()));

        return userRepository.save(user);
    }

    public String loginUser(AccountLoginPostRequest accountLoginPostRequest) {
        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(
                        accountLoginPostRequest.getEmail(),
                        accountLoginPostRequest.getPassword()
                )
        );

        SecurityContextHolder.getContext().setAuthentication(authentication);

        org.springframework.security.core.userdetails.User userDetails = (org.springframework.security.core.userdetails.User) authentication.getPrincipal();
        User user = userRepository.findByEmail(userDetails.getUsername()).get();


        return tokenProvider.generateToken(user);
    }
}
