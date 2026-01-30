-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

create table public.courts (
  id serial not null,
  venue_id integer null,
  court_number integer null,
  constraint courts_pkey primary key (id),
  constraint courts_venue_id_fkey foreign KEY (venue_id) references venue (id)
) TABLESPACE pg_default;

create table public.friends (
  id serial not null,
  player_id integer not null,
  friend_id integer not null,
  status character varying not null default 'pending'::character varying,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint friends_pkey primary key (id),
  constraint friends_unique_pair unique (player_id, friend_id),
  constraint friends_friend_id_fkey foreign KEY (friend_id) references players (id) on delete CASCADE,
  constraint friends_player_id_fkey foreign KEY (player_id) references players (id) on delete CASCADE,
  constraint friends_no_self_reference check ((player_id <> friend_id)),
  constraint friends_status_check check (
    (
      (status)::text = any (
        (
          array[
            'pending'::character varying,
            'accepted'::character varying,
            'blocked'::character varying
          ]
        )::text[]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_friends_player_id on public.friends using btree (player_id) TABLESPACE pg_default;

create index IF not exists idx_friends_friend_id on public.friends using btree (friend_id) TABLESPACE pg_default;

create index IF not exists idx_friends_status on public.friends using btree (status) TABLESPACE pg_default;

create trigger trigger_update_friends_updated_at BEFORE
update on friends for EACH row
execute FUNCTION update_friends_updated_at ();

create table public.match_format (
  id serial not null,
  type character varying not null,
  min_age integer null,
  max_age integer null,
  eligible_gender character varying not null,
  total_rounds integer null default 0,
  metadata jsonb null,
  constraint match_format_pkey primary key (id),
  constraint match_format_check check (
    (
      (
        (min_age is null)
        and (max_age is null)
      )
      or (max_age >= min_age)
    )
  ),
  constraint match_format_eligible_gender_check check (
    (
      (eligible_gender)::text = any (
        (
          array[
            'M'::character varying,
            'W'::character varying,
            'MW'::character varying
          ]
        )::text[]
      )
    )
  ),
  constraint match_format_total_rounds_check check ((total_rounds >= 0)),
  constraint match_format_type_check check (
    (
      (type)::text = any (
        (
          array[
            'mens_doubles'::character varying,
            'womens_doubles'::character varying,
            'mixed_doubles'::character varying,
            'singles'::character varying
          ]
        )::text[]
      )
    )
  )
) TABLESPACE pg_default;

create table public.matches (
  id serial not null,
  tournament_id integer null,
  refree_id integer null,
  court_id integer null,
  winner_team_id integer null,
  round text null,
  status character varying null,
  start_time timestamp with time zone null,
  end_time timestamp with time zone null,
  "AURA_Update" boolean null default false,
  constraint matches_pkey primary key (id),
  constraint matches_court_id_fkey foreign KEY (court_id) references courts (id),
  constraint matches_refree_id_fkey foreign KEY (refree_id) references players (id),
  constraint matches_tournament_id_fkey foreign KEY (tournament_id) references tournaments (id),
  constraint matches_winner_team_id_fkey foreign KEY (winner_team_id) references teams (team_id)
) TABLESPACE pg_default;

create table public.notifications (
  id serial not null,
  player_id integer not null,
  type character varying not null,
  reference_id text null,
  title text not null,
  message text not null,
  read boolean null default false,
  created_at timestamp with time zone null default now(),
  constraint notifications_pkey primary key (id),
  constraint notifications_player_id_fkey foreign KEY (player_id) references players (id) on delete CASCADE,
  constraint notifications_type_check check (
    (
      (type)::text = any (
        (
          array[
            'friend_request'::character varying,
            'tournament_invite'::character varying,
            'team_invite'::character varying,
            'friend_accepted'::character varying
          ]
        )::text[]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_notifications_player_id on public.notifications using btree (player_id) TABLESPACE pg_default;

create index IF not exists idx_notifications_read on public.notifications using btree (read) TABLESPACE pg_default;

create index IF not exists idx_notifications_created_at on public.notifications using btree (created_at desc) TABLESPACE pg_default;

create index IF not exists idx_notifications_type on public.notifications using btree (type) TABLESPACE pg_default;

create table public.pairing_teams (
  id serial not null,
  pairing_id integer null,
  team_id integer null,
  constraint pairing_teams_pkey primary key (id),
  constraint pairing_teams_pairing_id_fkey foreign KEY (pairing_id) references pairings (id),
  constraint pairing_teams_team_id_fkey foreign KEY (team_id) references teams (team_id)
) TABLESPACE pg_default;

create table public.pairings (
  id serial not null,
  tournament_id integer null,
  match_id integer null,
  constraint pairings_pkey primary key (id),
  constraint pairings_match_id_fkey foreign KEY (match_id) references matches (id),
  constraint pairings_tournament_id_fkey foreign KEY (tournament_id) references tournaments (id)
) TABLESPACE pg_default;

create table public.players (
  id serial not null,
  user_id uuid not null,
  username character varying null,
  dob date null,
  gender character varying null,
  photo_url text null,
  created_at timestamp with time zone null default now(),
  constraint players_pkey primary key (id),
  constraint players_user_id_fkey foreign KEY (user_id) references auth.users (id) on update CASCADE
) TABLESPACE pg_default;

create table public.rating_history (
  id serial not null,
  player_id integer null,
  match_id integer null,
  old_mu double precision null,
  old_sigma double precision null,
  new_mu double precision null,
  new_sigma double precision null,
  created_at timestamp with time zone null default now(),
  constraint rating_history_pkey primary key (id),
  constraint rating_history_match_id_fkey foreign KEY (match_id) references matches (id),
  constraint rating_history_player_id_fkey foreign KEY (player_id) references players (id)
) TABLESPACE pg_default;

create table public.ratings (
  id serial not null,
  player_id integer null,
  aura_mu double precision not null default '5'::double precision,
  aura_sigma double precision not null default '1.66'::double precision,
  last_updated timestamp with time zone not null default now(),
  constraint ratings_pkey primary key (id),
  constraint ratings_player_id_key unique (player_id),
  constraint ratings_player_id_fkey foreign KEY (player_id) references players (id)
) TABLESPACE pg_default;

create table public.registrations (
  id serial not null,
  tournament_id integer null,
  player_id integer null,
  txn_id uuid null,
  created_at timestamp with time zone null default now(),
  constraint registrations_pkey primary key (id),
  constraint registrations_player_id_fkey foreign KEY (player_id) references players (id),
  constraint registrations_tournament_id_fkey foreign KEY (tournament_id) references tournaments (id),
  constraint registrations_txn_id_fkey foreign KEY (txn_id) references transactions (id)
) TABLESPACE pg_default;

create table public.scores (
  id serial not null,
  match_id integer not null,
  team_a_score integer not null default 0,
  team_b_score integer not null default 0,
  serving_team_id integer null,
  server_sequence integer null,
  metadata jsonb null,
  created_at timestamp with time zone null default now(),
  constraint scores_pkey primary key (id),
  constraint scores_match_id_fkey foreign KEY (match_id) references matches (id),
  constraint scores_serving_team_id_fkey foreign KEY (serving_team_id) references teams (team_id),
  constraint scores_server_sequence_check check ((server_sequence = any (array[1, 2])))
) TABLESPACE pg_default;

create table public.team_members (
  id serial not null,
  team_id integer null,
  player_id integer null,
  created_at timestamp with time zone null,
  constraint team_members_pkey primary key (id),
  constraint team_members_player_id_fkey foreign KEY (player_id) references players (id),
  constraint team_members_team_id_fkey foreign KEY (team_id) references teams (team_id)
) TABLESPACE pg_default;

create table public.teams (
  team_id serial not null,
  created_at timestamp with time zone null default now(),
  tournament_id integer null,
  constraint teams_pkey primary key (team_id),
  constraint teams_tournament_id_fkey foreign KEY (tournament_id) references tournaments (id)
) TABLESPACE pg_default;


create table public.tournament_invites (
  id serial not null,
  tournament_id integer not null,
  inviter_id integer not null,
  invitee_id integer null,
  token text null,
  team_id integer null,
  status character varying not null default 'pending'::character varying,
  created_at timestamp with time zone null default now(),
  expires_at timestamp with time zone null,
  constraint tournament_invites_pkey primary key (id),
  constraint tournament_invites_token_key unique (token),
  constraint tournament_invites_invitee_id_fkey foreign KEY (invitee_id) references players (id) on delete CASCADE,
  constraint tournament_invites_inviter_id_fkey foreign KEY (inviter_id) references players (id) on delete CASCADE,
  constraint tournament_invites_team_id_fkey foreign KEY (team_id) references teams (team_id) on delete CASCADE,
  constraint tournament_invites_tournament_id_fkey foreign KEY (tournament_id) references tournaments (id) on delete CASCADE,
  constraint tournament_invites_status_check check (
    (
      (status)::text = any (
        (
          array[
            'pending'::character varying,
            'accepted'::character varying,
            'rejected'::character varying,
            'expired'::character varying
          ]
        )::text[]
      )
    )
  ),
  constraint tournament_invites_invitee_or_token check (
    (
      (
        (invitee_id is not null)
        and (token is null)
      )
      or (
        (invitee_id is null)
        and (token is not null)
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_tournament_invites_tournament_id on public.tournament_invites using btree (tournament_id) TABLESPACE pg_default;

create index IF not exists idx_tournament_invites_inviter_id on public.tournament_invites using btree (inviter_id) TABLESPACE pg_default;

create index IF not exists idx_tournament_invites_invitee_id on public.tournament_invites using btree (invitee_id) TABLESPACE pg_default;

create index IF not exists idx_tournament_invites_token on public.tournament_invites using btree (token) TABLESPACE pg_default;

create index IF not exists idx_tournament_invites_team_id on public.tournament_invites using btree (team_id) TABLESPACE pg_default;

create index IF not exists idx_tournament_invites_status on public.tournament_invites using btree (status) TABLESPACE pg_default;

create table public.games (
  id bigint generated by default as identity not null,
  created_at timestamp with time zone not null default now(),
  name text not null,
  metadata jsonb null,
  enabled boolean not null default true,
  constraint games_pkey primary key (id)
) TABLESPACE pg_default;

create table public.tournaments (
  id serial not null,
  host_id integer not null,
  name character varying not null,
  description text not null,
  sport_id text null,
  venue_id integer not null,
  match_format_id integer not null,
  start_time timestamp with time zone not null,
  end_time timestamp with time zone not null,
  capacity integer not null,
  registration_fee numeric(10, 2) null default 0.00,
  image_url text null,
  metadata jsonb null,
  created_at timestamp with time zone null default now(),
  round text null,
  game_id bigint not null,
  constraint tournaments_pkey primary key (id),
  constraint tournaments_game_id_fkey foreign KEY (game_id) references games (id),
  constraint tournaments_host_id_fkey foreign KEY (host_id) references players (id),
  constraint tournaments_match_format_id_fkey foreign KEY (match_format_id) references match_format (id),
  constraint tournaments_venue_id_fkey foreign KEY (venue_id) references venue (id),
  constraint tournaments_capacity_check check ((capacity > 0)),
  constraint tournaments_check check ((end_time > start_time))
) TABLESPACE pg_default;

create table public.tournaments_referee (
  id serial not null,
  player_id integer null,
  tournament_id integer null,
  constraint tournaments_referee_pkey primary key (id),
  constraint tournaments_referee_player_id_fkey foreign KEY (player_id) references players (id),
  constraint tournaments_referee_tournament_id_fkey foreign KEY (tournament_id) references tournaments (id)
) TABLESPACE pg_default;

create table public.transactions (
  id uuid not null default extensions.uuid_generate_v4 (),
  amount numeric(10, 2) null,
  type character varying null,
  status character varying null,
  created_at timestamp with time zone null default now(),
  constraint transactions_pkey primary key (id)
) TABLESPACE pg_default;

create table public.venue (
  id serial not null,
  name character varying null,
  address text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null,
  metadata jsonb null,
  constraint venue_pkey primary key (id)
) TABLESPACE pg_default;