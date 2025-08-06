package org.pianoml.backend.mapper;

import javax.annotation.processing.Generated;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.model.AccountCreatePostRequest;
import org.pianoml.backend.model.UserApiInfo;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Generated(
    value = "org.mapstruct.ap.MappingProcessor",
    date = "2025-08-06T14:23:43+0000",
    comments = "version: 1.5.5.Final, compiler: javac, environment: Java 21.0.8 (Ubuntu)"
)
@Component
public class UserMapperImpl implements UserMapper {

    @Autowired
    private UriMapper uriMapper;

    @Override
    public UserApiInfo toUserApiInfo(User user) {
        if ( user == null ) {
            return null;
        }

        UserApiInfo userApiInfo = new UserApiInfo();

        userApiInfo.setEmail( user.getEmail() );
        userApiInfo.setName( user.getName() );
        userApiInfo.setUrl( user.getUrl() );
        userApiInfo.setBio( uriMapper.asUri( user.getBio() ) );
        userApiInfo.setImage( uriMapper.asUri( user.getImage() ) );

        return userApiInfo;
    }

    @Override
    public User toUser(AccountCreatePostRequest accountCreatePostRequest) {
        if ( accountCreatePostRequest == null ) {
            return null;
        }

        User user = new User();

        user.setEmail( accountCreatePostRequest.getEmail() );
        user.setName( accountCreatePostRequest.getName() );
        user.setPassword( accountCreatePostRequest.getPassword() );

        user.setVerified( false );

        return user;
    }
}
