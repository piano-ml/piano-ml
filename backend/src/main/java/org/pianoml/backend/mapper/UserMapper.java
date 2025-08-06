package org.pianoml.backend.mapper;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.pianoml.backend.entity.User;
import org.pianoml.backend.model.UserApiInfo;
import org.pianoml.backend.model.AccountCreatePostRequest;

@Mapper(componentModel = "spring", uses = UriMapper.class)
public interface UserMapper {

    UserApiInfo toUserApiInfo(User user);

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "verified", constant = "false")
    @Mapping(target = "url", ignore = true)
    @Mapping(target = "bio", ignore = true)
    @Mapping(target = "image", ignore = true)
    User toUser(AccountCreatePostRequest accountCreatePostRequest);
}
