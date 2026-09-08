-- ============================================================
--  UITogether - DEMO SEED DATA  (optional, clearly identified)
-- ------------------------------------------------------------
--  Run with:  npm run db:seed
--
--  !! EVERY ROW BELOW IS FAKE DEMO DATA FOR LOCAL DEVELOPMENT !!
--  Do not load this into a production database.
--
--  Demo credentials (bcrypt cost 12, real hashes):
--    admin.uitogether@gmail.com   / Admin@123      (role: admin)
--    aung.kyaw.dev@gmail.com      / Student@123    (role: student)
--    su.myat.noe.dev@gmail.com    / Student@123
--    kyaw.zin.dev@gmail.com       / Student@123
--    thiri.aung.dev@gmail.com     / Student@123
--    min.khant.dev@gmail.com      / Student@123
--    ei.phyu.dev@gmail.com        / Student@123
--
--  IDs are explicit so the file can be re-run safely (INSERT IGNORE).
-- ============================================================

SET FOREIGN_KEY_CHECKS = 1;

-- ------------------------------------------------------------
-- users  (1 = admin, 2..7 = students)
-- ------------------------------------------------------------
INSERT IGNORE INTO users (user_id, name, email, tnt, academic_year, password_hash, role) VALUES
(1, 'UITogether Admin', 'admin.uitogether@gmail.com', 'TNT-0000', 'Staff',      '$2b$12$bS5cB4VJ7RXWysKxXxZygO0v7blZalFLODCdQEJxhWVawXTTNbb0q', 'admin'),
(2, 'Aung Kyaw',        'aung.kyaw.dev@gmail.com',    'TNT-1001', '2nd Year',   '$2b$12$byIXZ8XDDrUCrixUeEUmYuEHy8Inwu8fzyvIRAiJsnbELJMipi9ei', 'student'),
(3, 'Su Myat Noe',      'su.myat.noe.dev@gmail.com',  'TNT-1002', '2nd Year',   '$2b$12$NgJXEuPzFEU2RetAQkfpiuzDBGgtplcNzBW7LjbIvuFtCCGEeiEiW', 'student'),
(4, 'Kyaw Zin',         'kyaw.zin.dev@gmail.com',     'TNT-1003', '3rd Year',   '$2b$12$wP/I4eJlToIErcij5bIbIuNJ1cy00L/W/7kffZ2vKCLML4uuk43M2', 'student'),
(5, 'Thiri Aung',       'thiri.aung.dev@gmail.com',   'TNT-1004', '1st Year',   '$2b$12$IX/RkXDUdbWBnb2u/vfMauj5LHjUELQ0IOlYhp4ZtDLCraqKs2SnK', 'student'),
(6, 'Min Khant',        'min.khant.dev@gmail.com',    'TNT-1005', '3rd Year',   '$2b$12$gQ7rfv1Su2MF9HgIM5u.duEB2eTJWBhPHOYC1kXpK0t/xVgmcEHx2', 'student'),
(7, 'Ei Phyu',          'ei.phyu.dev@gmail.com',      'TNT-1006', 'Final Year', '$2b$12$MO6tVjN4V8zjUBIzhgWjbOAOJgV7GOJ4WxOVahSX2bGmyWjJ9GHoi', 'student');

-- ------------------------------------------------------------
-- study_buddy_profiles  (telegram / viber are PRIVATE columns)
-- ------------------------------------------------------------
INSERT IGNORE INTO study_buddy_profiles
  (profile_id, user_id, nickname, semester, study_style, weak_subjects, strong_subjects, wanna_meet, notes, telegram, viber) VALUES
(1, 2, 'AK',      'Semester 4', 'group_discussion', 'Calculus, Statistics',        'Java, Data Structures',     'both',      'Free after 4pm on weekdays.',        '@aungkyaw_dev',  '+959111111111'),
(2, 3, 'SuSu',    'Semester 4', 'quiet_library',    'Java, Data Structures',       'Calculus, Statistics',      'in_person', 'Library 3rd floor is my spot.',      '@susu_study',    NULL),
(3, 4, 'KZ',      'Semester 6', 'online_call',      'Networking',                  'Database, SQL',             'online',    'Prefer Telegram voice calls.',       '@kyawzin_db',    '+959222222222'),
(4, 5, 'Thiri',   'Semester 2', 'mixed',            'Physics, English',            'Discrete Math',             'both',      'New here, looking for a study group.', NULL,            '+959333333333'),
(5, 6, 'MinK',    'Semester 6', 'solo_focus',       'Database',                    'Networking, Linux',         'in_person', 'Morning person.',                    '@minkhant_net',  NULL),
(6, 7, 'EiEi',    'Semester 8', 'group_discussion', 'Machine Learning',            'Web Development, React',    'both',      'Final year project buddy wanted.',   '@eiphyu_web',    '+959444444444');

-- ------------------------------------------------------------
-- buddy_requests
--   2 <-> 3 : ACCEPTED  -> mutual match, contacts unlocked
--   4  -> 2 : pending   (2 can accept / reject)
--   5  -> 6 : rejected
--   3  -> 7 : pending
-- ------------------------------------------------------------
INSERT IGNORE INTO buddy_requests (request_id, sender_id, receiver_id, status) VALUES
(1, 2, 3, 'accepted'),
(2, 4, 2, 'pending'),
(3, 5, 6, 'rejected'),
(4, 3, 7, 'pending');

-- ------------------------------------------------------------
-- competitions  (created_by MUST be an admin - trigger enforced)
-- ------------------------------------------------------------
INSERT IGNORE INTO competitions
  (competition_id, title, description, event_date, event_time, location, organizer, image_url, created_by) VALUES
(1, 'UIT Hackathon 2026',
    'A 24-hour hackathon for all UIT students. Teams of 3-4. Bring your own laptop.',
    '2026-09-20', '09:00:00', 'UIT Main Hall', 'UIT Computer Club', NULL, 1),
(2, 'Inter-University Programming Contest',
    'ACM-style contest. Individual registration, on-site judging.',
    '2026-10-05', '13:30:00', 'Lab Building B, Room 204', 'Faculty of Computer Science', NULL, 1),
(3, 'Freshers Welcome Night',
    'Music, games and club introductions for first year students.',
    '2026-09-02', '17:00:00', 'UIT Open Ground', 'Student Union', NULL, 1);

-- ------------------------------------------------------------
-- lost_found
-- ------------------------------------------------------------
INSERT IGNORE INTO lost_found
  (item_id, user_id, type, title, description, location, item_date, image_url, contact_info, status) VALUES
(1, 2, 'lost',  'Black Casio calculator',  'fx-991EX, small scratch on the back cover.', 'Lab Building B',  '2026-08-24', NULL, 'Telegram @aungkyaw_dev', 'active'),
(2, 5, 'found', 'Blue UIT student card',   'Found near the canteen entrance. Name starts with "Nay".', 'Canteen', '2026-08-25', NULL, 'Viber +959333333333', 'active'),
(3, 6, 'lost',  'USB drive 32GB',          'SanDisk, has final year project files.',     'Library 3rd floor', '2026-08-20', NULL, 'Telegram @minkhant_net', 'resolved');

-- ------------------------------------------------------------
-- polls / poll_options / votes  (admin creates, students vote)
-- Poll 2 is inserted OPEN, voted on, then closed - the DB trigger
-- refuses votes on a poll that is already closed.
-- ------------------------------------------------------------
INSERT IGNORE INTO polls (poll_id, question, description, status, ends_at, created_by) VALUES
(1, 'Which day works best for the weekly study meetup?', 'Pick one day. Results decide the schedule.', 'open',  '2026-12-31 23:59:59', 1),
(2, 'Best canteen snack at UIT?',                        'Just for fun.',                              'open',  NULL,                  1);

INSERT IGNORE INTO poll_options (option_id, poll_id, option_text, display_order) VALUES
(1, 1, 'Monday',        1),
(2, 1, 'Wednesday',     2),
(3, 1, 'Friday',        3),
(4, 1, 'Saturday',      4),
(5, 2, 'Mohinga',       1),
(6, 2, 'Samosa',        2),
(7, 2, 'Milk tea only', 3);

INSERT IGNORE INTO votes (vote_id, poll_id, option_id, user_id) VALUES
(1, 1, 2, 2),
(2, 1, 2, 3),
(3, 1, 4, 4),
(4, 1, 3, 5),
(5, 2, 7, 2),
(6, 2, 5, 6),
(7, 2, 7, 7);

UPDATE polls SET status = 'closed' WHERE poll_id = 2;

-- ------------------------------------------------------------
-- notifications  (one row per recipient)
-- ------------------------------------------------------------
INSERT IGNORE INTO notifications
  (notification_id, user_id, type, title, message, reference_type, reference_id, is_read) VALUES
(1, 3, 'buddy_request',          'New buddy request',      'Aung Kyaw sent you a study buddy request.',       'buddy_request', 1, 1),
(2, 2, 'buddy_request_accepted', 'You have a new match!',  'Su Myat Noe accepted your request. Contact unlocked.', 'buddy_request', 1, 0),
(3, 2, 'buddy_request',          'New buddy request',      'Kyaw Zin sent you a study buddy request.',        'buddy_request', 2, 0),
(4, 5, 'buddy_request_rejected', 'Request declined',       'Min Khant declined your study buddy request.',    'buddy_request', 3, 0),
(5, 7, 'buddy_request',          'New buddy request',      'Su Myat Noe sent you a study buddy request.',     'buddy_request', 4, 0),
(6, 2, 'new_competition',        'New event posted',       'UIT Hackathon 2026 - 20 Sep 2026',                'competition',   1, 0),
(7, 3, 'new_competition',        'New event posted',       'UIT Hackathon 2026 - 20 Sep 2026',                'competition',   1, 0),
(8, 4, 'new_poll',               'New poll is open',       'Which day works best for the weekly study meetup?', 'poll',        1, 0);
