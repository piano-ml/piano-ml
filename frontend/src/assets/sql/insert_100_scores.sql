-- Script SQL pour créer 100 partitions avec le même auteur et propriétaire
-- Table: pianoml.score

-- Variables pour l'auteur et le propriétaire (à réutiliser)
-- author_id: 550e8400-e29b-41d4-a716-446655440001
-- owner_id:  550e8400-e29b-41d4-a716-446655440002

INSERT INTO pianoml.score (
    id,
    title,
    author_id,
    genre_id,
    version,
    owner_id,
    tracks_count,
    hand_separated,
    has_lyrics,
    grade,
    uploaded_at,
    updated_at,
    has_pdf,
    image,
    mbid,
    has_mscz,
    deleted,
    duration,
    study_tracks,
    publish
) VALUES
-- Partition 1-10: Classique
('550e8400-e29b-41d4-a716-446655440101', 'Für Elise', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 2, true, false, 3, NOW(), NOW(), true, 'fur_elise.jpg', '550e8400-e29b-41d4-a716-446655440201', true, false, 180, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440102', 'Moonlight Sonata', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 3, true, false, 5, NOW(), NOW(), true, 'moonlight.jpg', '550e8400-e29b-41d4-a716-446655440202', true, false, 900, '[0,1,2]', true),
('550e8400-e29b-41d4-a716-446655440103', 'Canon in D', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 4, true, false, 4, NOW(), NOW(), true, 'canon.jpg', '550e8400-e29b-41d4-a716-446655440203', true, false, 360, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440104', 'Clair de Lune', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 2, true, false, 4, NOW(), NOW(), true, 'clair_lune.jpg', '550e8400-e29b-41d4-a716-446655440204', true, false, 300, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440105', 'Ave Maria', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 2, true, true, 3, NOW(), NOW(), true, 'ave_maria.jpg', '550e8400-e29b-41d4-a716-446655440205', true, false, 240, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440106', 'Turkish March', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 2, true, false, 5, NOW(), NOW(), true, 'turkish.jpg', '550e8400-e29b-41d4-a716-446655440206', true, false, 210, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440107', 'Prelude in C Major', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 1, false, false, 2, NOW(), NOW(), true, 'prelude_c.jpg', '550e8400-e29b-41d4-a716-446655440207', true, false, 120, '[0]', true),
('550e8400-e29b-41d4-a716-446655440108', 'Gymnopédie No. 1', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 2, true, false, 3, NOW(), NOW(), true, 'gymnopedie.jpg', '550e8400-e29b-41d4-a716-446655440208', true, false, 210, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440109', 'Arabesque No. 1', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 2, true, false, 4, NOW(), NOW(), true, 'arabesque.jpg', '550e8400-e29b-41d4-a716-446655440209', true, false, 270, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440110', 'Minute Waltz', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 2, true, false, 6, NOW(), NOW(), true, 'minute_waltz.jpg', '550e8400-e29b-41d4-a716-446655440210', true, false, 120, '[0,1]', true),

-- Partition 11-20: Jazz et Blues
('550e8400-e29b-41d4-a716-446655440111', 'Blue Moon', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 3, true, true, 4, NOW(), NOW(), true, 'blue_moon.jpg', '550e8400-e29b-41d4-a716-446655440211', true, false, 195, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440112', 'Autumn Leaves', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 4, true, true, 5, NOW(), NOW(), true, 'autumn.jpg', '550e8400-e29b-41d4-a716-446655440212', true, false, 240, '[0,1,2]', true),
('550e8400-e29b-41d4-a716-446655440113', 'Take Five', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 5, true, false, 6, NOW(), NOW(), true, 'take_five.jpg', '550e8400-e29b-41d4-a716-446655440213', true, false, 330, '[0,1,2]', true),
('550e8400-e29b-41d4-a716-446655440114', 'Summertime', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 3, true, true, 4, NOW(), NOW(), true, 'summertime.jpg', '550e8400-e29b-41d4-a716-446655440214', true, false, 180, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440115', 'Round Midnight', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 4, true, false, 5, NOW(), NOW(), true, 'round_midnight.jpg', '550e8400-e29b-41d4-a716-446655440215', true, false, 270, '[0,1,2]', true),
('550e8400-e29b-41d4-a716-446655440116', 'All of Me', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 3, true, true, 4, NOW(), NOW(), true, 'all_of_me.jpg', '550e8400-e29b-41d4-a716-446655440216', true, false, 210, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440117', 'Fly Me to the Moon', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 4, true, true, 3, NOW(), NOW(), true, 'fly_moon.jpg', '550e8400-e29b-41d4-a716-446655440217', true, false, 150, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440118', 'Girl from Ipanema', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 4, true, true, 4, NOW(), NOW(), true, 'ipanema.jpg', '550e8400-e29b-41d4-a716-446655440218', true, false, 225, '[0,1,2]', true),
('550e8400-e29b-41d4-a716-446655440119', 'Georgia on My Mind', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 3, true, true, 4, NOW(), NOW(), true, 'georgia.jpg', '550e8400-e29b-41d4-a716-446655440219', true, false, 195, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440120', 'Body and Soul', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 4, true, true, 5, NOW(), NOW(), true, 'body_soul.jpg', '550e8400-e29b-41d4-a716-446655440220', true, false, 300, '[0,1,2]', true),

-- Partition 21-30: Musique populaire
('550e8400-e29b-41d4-a716-446655440121', 'Yesterday', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 3, true, true, 3, NOW(), NOW(), true, 'yesterday.jpg', '550e8400-e29b-41d4-a716-446655440221', true, false, 135, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440122', 'Let It Be', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 4, true, true, 3, NOW(), NOW(), true, 'let_it_be.jpg', '550e8400-e29b-41d4-a716-446655440222', true, false, 240, '[0,1,2]', true),
('550e8400-e29b-41d4-a716-446655440123', 'Imagine', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 3, true, true, 3, NOW(), NOW(), true, 'imagine.jpg', '550e8400-e29b-41d4-a716-446655440223', true, false, 183, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440124', 'Hotel California', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 5, true, true, 5, NOW(), NOW(), true, 'hotel_california.jpg', '550e8400-e29b-41d4-a716-446655440224', true, false, 390, '[0,1,2]', true),
('550e8400-e29b-41d4-a716-446655440125', 'Bohemian Rhapsody', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 6, true, true, 6, NOW(), NOW(), true, 'bohemian.jpg', '550e8400-e29b-41d4-a716-446655440225', true, false, 355, '[0,1,2,3]', true),
('550e8400-e29b-41d4-a716-446655440126', 'Piano Man', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 4, true, true, 4, NOW(), NOW(), true, 'piano_man.jpg', '550e8400-e29b-41d4-a716-446655440226', true, false, 345, '[0,1,2]', true),
('550e8400-e29b-41d4-a716-446655440127', 'My Way', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 3, true, true, 4, NOW(), NOW(), true, 'my_way.jpg', '550e8400-e29b-41d4-a716-446655440227', true, false, 275, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440128', 'Bridge Over Troubled Water', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 4, true, true, 4, NOW(), NOW(), true, 'bridge.jpg', '550e8400-e29b-41d4-a716-446655440228', true, false, 295, '[0,1,2]', true),
('550e8400-e29b-41d4-a716-446655440129', 'Sound of Silence', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 3, true, true, 3, NOW(), NOW(), true, 'silence.jpg', '550e8400-e29b-41d4-a716-446655440229', true, false, 180, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440130', 'Your Song', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 3, true, true, 3, NOW(), NOW(), true, 'your_song.jpg', '550e8400-e29b-41d4-a716-446655440230', true, false, 240, '[0,1]', true),

-- Partition 31-40: Études et exercices
('550e8400-e29b-41d4-a716-446655440131', 'Étude Op. 10 No. 1', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 2, true, false, 6, NOW(), NOW(), true, 'etude_op10_1.jpg', '550e8400-e29b-41d4-a716-446655440231', true, false, 120, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440132', 'Étude Op. 10 No. 3', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 2, true, false, 5, NOW(), NOW(), true, 'etude_op10_3.jpg', '550e8400-e29b-41d4-a716-446655440232', true, false, 180, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440133', 'Invention No. 1 in C', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 2, true, false, 3, NOW(), NOW(), true, 'invention_1.jpg', '550e8400-e29b-41d4-a716-446655440233', true, false, 90, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440134', 'Invention No. 4 in D minor', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 2, true, false, 3, NOW(), NOW(), true, 'invention_4.jpg', '550e8400-e29b-41d4-a716-446655440234', true, false, 105, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440135', 'Hanon Exercise No. 1', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 2, true, false, 2, NOW(), NOW(), true, 'hanon_1.jpg', '550e8400-e29b-41d4-a716-446655440235', true, false, 60, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440136', 'Scale Exercise C Major', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 2, true, false, 1, NOW(), NOW(), true, 'scale_c.jpg', '550e8400-e29b-41d4-a716-446655440236', true, false, 30, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440137', 'Arpeggio Exercise', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 2, true, false, 2, NOW(), NOW(), true, 'arpeggio.jpg', '550e8400-e29b-41d4-a716-446655440237', true, false, 45, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440138', 'Chromatic Scale', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 2, true, false, 2, NOW(), NOW(), true, 'chromatic.jpg', '550e8400-e29b-41d4-a716-446655440238', true, false, 40, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440139', 'Finger Independence', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 2, true, false, 3, NOW(), NOW(), true, 'finger_indep.jpg', '550e8400-e29b-41d4-a716-446655440239', true, false, 90, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440140', 'Octave Exercise', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 2, true, false, 4, NOW(), NOW(), true, 'octave.jpg', '550e8400-e29b-41d4-a716-446655440240', true, false, 75, '[0,1]', true),

-- Partition 41-50: Musique de film
('550e8400-e29b-41d4-a716-446655440141', 'Theme from Jaws', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 3, true, false, 3, NOW(), NOW(), true, 'jaws.jpg', '550e8400-e29b-41d4-a716-446655440241', true, false, 90, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440142', 'Star Wars Main Theme', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 4, true, false, 5, NOW(), NOW(), true, 'star_wars.jpg', '550e8400-e29b-41d4-a716-446655440242', true, false, 330, '[0,1,2]', true),
('550e8400-e29b-41d4-a716-446655440143', 'E.T. Theme', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 3, true, false, 4, NOW(), NOW(), true, 'et.jpg', '550e8400-e29b-41d4-a716-446655440243', true, false, 195, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440144', 'Jurassic Park Theme', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 4, true, false, 4, NOW(), NOW(), true, 'jurassic.jpg', '550e8400-e29b-41d4-a716-446655440244', true, false, 210, '[0,1,2]', true),
('550e8400-e29b-41d4-a716-446655440145', 'Indiana Jones March', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 4, true, false, 5, NOW(), NOW(), true, 'indiana.jpg', '550e8400-e29b-41d4-a716-446655440245', true, false, 270, '[0,1,2]', true),
('550e8400-e29b-41d4-a716-446655440146', 'Harry Potter Theme', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 3, true, false, 4, NOW(), NOW(), true, 'harry_potter.jpg', '550e8400-e29b-41d4-a716-446655440246', true, false, 180, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440147', 'Pirates of the Caribbean', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 5, true, false, 5, NOW(), NOW(), true, 'pirates.jpg', '550e8400-e29b-41d4-a716-446655440247', true, false, 255, '[0,1,2]', true),
('550e8400-e29b-41d4-a716-446655440148', 'Lord of the Rings', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 4, true, false, 5, NOW(), NOW(), true, 'lotr.jpg', '550e8400-e29b-41d4-a716-446655440248', true, false, 285, '[0,1,2]', true),
('550e8400-e29b-41d4-a716-446655440149', 'Titanic Theme', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 3, true, true, 4, NOW(), NOW(), true, 'titanic.jpg', '550e8400-e29b-41d4-a716-446655440249', true, false, 270, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440150', 'Gladiator Theme', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 4, true, false, 4, NOW(), NOW(), true, 'gladiator.jpg', '550e8400-e29b-41d4-a716-446655440250', true, false, 225, '[0,1,2]', true),

-- Partition 51-60: Musique de Noël
('550e8400-e29b-41d4-a716-446655440151', 'Silent Night', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 2, true, true, 2, NOW(), NOW(), true, 'silent_night.jpg', '550e8400-e29b-41d4-a716-446655440251', true, false, 180, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440152', 'Jingle Bells', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 3, true, true, 1, NOW(), NOW(), true, 'jingle_bells.jpg', '550e8400-e29b-41d4-a716-446655440252', true, false, 120, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440153', 'White Christmas', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 3, true, true, 3, NOW(), NOW(), true, 'white_christmas.jpg', '550e8400-e29b-41d4-a716-446655440253', true, false, 195, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440154', 'The Christmas Song', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 3, true, true, 4, NOW(), NOW(), true, 'christmas_song.jpg', '550e8400-e29b-41d4-a716-446655440254', true, false, 210, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440155', 'Let It Snow', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 3, true, true, 3, NOW(), NOW(), true, 'let_it_snow.jpg', '550e8400-e29b-41d4-a716-446655440255', true, false, 150, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440156', 'Have Yourself a Merry Little Christmas', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 3, true, true, 3, NOW(), NOW(), true, 'merry_christmas.jpg', '550e8400-e29b-41d4-a716-446655440256', true, false, 225, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440157', 'Blue Christmas', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 3, true, true, 3, NOW(), NOW(), true, 'blue_christmas.jpg', '550e8400-e29b-41d4-a716-446655440257', true, false, 165, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440158', 'Santa Claus Is Coming to Town', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 4, true, true, 3, NOW(), NOW(), true, 'santa_coming.jpg', '550e8400-e29b-41d4-a716-446655440258', true, false, 180, '[0,1,2]', true),
('550e8400-e29b-41d4-a716-446655440159', 'Silver Bells', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 3, true, true, 3, NOW(), NOW(), true, 'silver_bells.jpg', '550e8400-e29b-41d4-a716-446655440259', true, false, 195, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440160', 'Feliz Navidad', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 4, true, true, 2, NOW(), NOW(), true, 'feliz_navidad.jpg', '550e8400-e29b-41d4-a716-446655440260', true, false, 165, '[0,1,2]', true),

-- Partition 61-70: Valses
('550e8400-e29b-41d4-a716-446655440161', 'Blue Danube Waltz', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 3, true, false, 4, NOW(), NOW(), true, 'blue_danube.jpg', '550e8400-e29b-41d4-a716-446655440261', true, false, 540, '[0,1,2]', true),
('550e8400-e29b-41d4-a716-446655440162', 'Emperor Waltz', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 3, true, false, 4, NOW(), NOW(), true, 'emperor_waltz.jpg', '550e8400-e29b-41d4-a716-446655440262', true, false, 420, '[0,1,2]', true),
('550e8400-e29b-41d4-a716-446655440163', 'Tales from Vienna Woods', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 3, true, false, 4, NOW(), NOW(), true, 'vienna_woods.jpg', '550e8400-e29b-41d4-a716-446655440263', true, false, 375, '[0,1,2]', true),
('550e8400-e29b-41d4-a716-446655440164', 'Roses from the South', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 3, true, false, 4, NOW(), NOW(), true, 'roses_south.jpg', '550e8400-e29b-41d4-a716-446655440264', true, false, 330, '[0,1,2]', true),
('550e8400-e29b-41d4-a716-446655440165', 'Wine Women and Song', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 3, true, false, 5, NOW(), NOW(), true, 'wine_women.jpg', '550e8400-e29b-41d4-a716-446655440265', true, false, 450, '[0,1,2]', true),
('550e8400-e29b-41d4-a716-446655440166', 'Artist Life Waltz', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 3, true, false, 4, NOW(), NOW(), true, 'artist_life.jpg', '550e8400-e29b-41d4-a716-446655440266', true, false, 390, '[0,1,2]', true),
('550e8400-e29b-41d4-a716-446655440167', 'Morning Papers Waltz', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 3, true, false, 4, NOW(), NOW(), true, 'morning_papers.jpg', '550e8400-e29b-41d4-a716-446655440267', true, false, 360, '[0,1,2]', true),
('550e8400-e29b-41d4-a716-446655440168', 'Voices of Spring', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 3, true, false, 5, NOW(), NOW(), true, 'voices_spring.jpg', '550e8400-e29b-41d4-a716-446655440268', true, false, 405, '[0,1,2]', true),
('550e8400-e29b-41d4-a716-446655440169', 'Acceleration Waltz', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 3, true, false, 5, NOW(), NOW(), true, 'acceleration.jpg', '550e8400-e29b-41d4-a716-446655440269', true, false, 480, '[0,1,2]', true),
('550e8400-e29b-41d4-a716-446655440170', 'Thunder and Lightning', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 4, true, false, 5, NOW(), NOW(), true, 'thunder_lightning.jpg', '550e8400-e29b-41d4-a716-446655440270', true, false, 420, '[0,1,2,3]', true),

-- Partition 71-80: Musique moderne
('550e8400-e29b-41d4-a716-446655440171', 'Comptine d''un autre été', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 2, true, false, 3, NOW(), NOW(), true, 'comptine.jpg', '550e8400-e29b-41d4-a716-446655440271', true, false, 150, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440172', 'River Flows in You', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 2, true, false, 4, NOW(), NOW(), true, 'river_flows.jpg', '550e8400-e29b-41d4-a716-446655440272', true, false, 210, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440173', 'Kiss the Rain', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 2, true, false, 4, NOW(), NOW(), true, 'kiss_rain.jpg', '550e8400-e29b-41d4-a716-446655440273', true, false, 270, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440174', 'Nuvole Bianche', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 2, true, false, 4, NOW(), NOW(), true, 'nuvole_bianche.jpg', '550e8400-e29b-41d4-a716-446655440274', true, false, 330, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440175', 'Una Mattina', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 2, true, false, 3, NOW(), NOW(), true, 'una_mattina.jpg', '550e8400-e29b-41d4-a716-446655440275', true, false, 225, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440176', 'Divenire', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 3, true, false, 4, NOW(), NOW(), true, 'divenire.jpg', '550e8400-e29b-41d4-a716-446655440276', true, false, 420, '[0,1,2]', true),
('550e8400-e29b-41d4-a716-446655440177', 'Primavera', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 2, true, false, 3, NOW(), NOW(), true, 'primavera.jpg', '550e8400-e29b-41d4-a716-446655440277', true, false, 195, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440178', 'Le Onde', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 2, true, false, 4, NOW(), NOW(), true, 'le_onde.jpg', '550e8400-e29b-41d4-a716-446655440278', true, false, 360, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440179', 'Nightbook', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 2, true, false, 4, NOW(), NOW(), true, 'nightbook.jpg', '550e8400-e29b-41d4-a716-446655440279', true, false, 300, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440180', 'I Giorni', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 2, true, false, 3, NOW(), NOW(), true, 'i_giorni.jpg', '550e8400-e29b-41d4-a716-446655440280', true, false, 345, '[0,1]', true),

-- Partition 81-90: Musique baroque
('550e8400-e29b-41d4-a716-446655440181', 'Brandenburg Concerto No. 3', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 4, true, false, 5, NOW(), NOW(), true, 'brandenburg_3.jpg', '550e8400-e29b-41d4-a716-446655440281', true, false, 360, '[0,1,2]', true),
('550e8400-e29b-41d4-a716-446655440182', 'Air on the G String', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 3, true, false, 4, NOW(), NOW(), true, 'air_g_string.jpg', '550e8400-e29b-41d4-a716-446655440282', true, false, 300, '[0,1,2]', true),
('550e8400-e29b-41d4-a716-446655440183', 'Jesu Joy of Man''s Desiring', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 3, true, false, 4, NOW(), NOW(), true, 'jesu_joy.jpg', '550e8400-e29b-41d4-a716-446655440283', true, false, 210, '[0,1,2]', true),
('550e8400-e29b-41d4-a716-446655440184', 'Toccata and Fugue in D minor', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 2, true, false, 6, NOW(), NOW(), true, 'toccata_fugue.jpg', '550e8400-e29b-41d4-a716-446655440284', true, false, 540, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440185', 'Goldberg Variation No. 1', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 2, true, false, 5, NOW(), NOW(), true, 'goldberg_1.jpg', '550e8400-e29b-41d4-a716-446655440285', true, false, 120, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440186', 'Well-Tempered Clavier Book 1', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 2, true, false, 5, NOW(), NOW(), true, 'wtc_book1.jpg', '550e8400-e29b-41d4-a716-446655440286', true, false, 150, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440187', 'French Suite No. 5', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 2, true, false, 4, NOW(), NOW(), true, 'french_suite_5.jpg', '550e8400-e29b-41d4-a716-446655440287', true, false, 480, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440188', 'Italian Concerto', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 2, true, false, 5, NOW(), NOW(), true, 'italian_concerto.jpg', '550e8400-e29b-41d4-a716-446655440288', true, false, 720, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440189', 'Partita No. 1 in B♭', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 2, true, false, 5, NOW(), NOW(), true, 'partita_1.jpg', '550e8400-e29b-41d4-a716-446655440289', true, false, 600, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440190', 'Chromatic Fantasy', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 2, true, false, 6, NOW(), NOW(), true, 'chromatic_fantasy.jpg', '550e8400-e29b-41d4-a716-446655440290', true, false, 420, '[0,1]', true),

-- Partition 91-100: Musique contemporaine
('550e8400-e29b-41d4-a716-446655440191', 'Mad World', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 3, true, true, 4, NOW(), NOW(), true, 'mad_world.jpg', '550e8400-e29b-41d4-a716-446655440291', true, false, 195, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440192', 'Hallelujah', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 3, true, true, 4, NOW(), NOW(), true, 'hallelujah.jpg', '550e8400-e29b-41d4-a716-446655440292', true, false, 270, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440193', 'The Scientist', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 4, true, true, 4, NOW(), NOW(), true, 'scientist.jpg', '550e8400-e29b-41d4-a716-446655440293', true, false, 315, '[0,1,2]', true),
('550e8400-e29b-41d4-a716-446655440194', 'Clocks', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 4, true, true, 3, NOW(), NOW(), true, 'clocks.jpg', '550e8400-e29b-41d4-a716-446655440294', true, false, 300, '[0,1,2]', true),
('550e8400-e29b-41d4-a716-446655440195', 'Fix You', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 4, true, true, 4, NOW(), NOW(), true, 'fix_you.jpg', '550e8400-e29b-41d4-a716-446655440295', true, false, 285, '[0,1,2]', true),
('550e8400-e29b-41d4-a716-446655440196', 'Viva la Vida', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 5, true, true, 4, NOW(), NOW(), true, 'viva_la_vida.jpg', '550e8400-e29b-41d4-a716-446655440296', true, false, 240, '[0,1,2,3]', true),
('550e8400-e29b-41d4-a716-446655440197', 'Someone Like You', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 3, true, true, 3, NOW(), NOW(), true, 'someone_like_you.jpg', '550e8400-e29b-41d4-a716-446655440297', true, false, 285, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440198', 'Rolling in the Deep', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 4, true, true, 4, NOW(), NOW(), true, 'rolling_deep.jpg', '550e8400-e29b-41d4-a716-446655440298', true, false, 225, '[0,1,2]', true),
('550e8400-e29b-41d4-a716-446655440199', 'Hello', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 3, true, true, 4, NOW(), NOW(), true, 'hello.jpg', '550e8400-e29b-41d4-a716-446655440299', true, false, 295, '[0,1]', true),
('550e8400-e29b-41d4-a716-446655440200', 'All I Ask', '550e8400-e29b-41d4-a716-446655440001', NULL, 1, '550e8400-e29b-41d4-a716-446655440002', 3, true, true, 4, NOW(), NOW(), true, 'all_i_ask.jpg', '550e8400-e29b-41d4-a716-446655440300', true, false, 270, '[0,1]', true);

-- Vérification du nombre d'enregistrements insérés
SELECT COUNT(*) as total_scores FROM pianoml.score;

-- Vérification des données avec quelques exemples
SELECT id, title, author_id, owner_id, mbid, grade, duration 
FROM pianoml.score 
ORDER BY title 
LIMIT 10;
