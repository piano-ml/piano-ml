create database pianoml;
create user web with password "web"
alter user "web" with login;
\c pianoml;
create schema pianoml;
alter schema pianoml owner to web;

