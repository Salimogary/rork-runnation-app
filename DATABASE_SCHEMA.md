# Database Schema Documentation

## Required Tables

### 1. activities (Existing)
Already configured with the following schema:

```sql
create table public."activities" (
  "ActivityID" text not null,
  "RegistrationID" text null,
  "Activity_Date" date null,
  "Exercise_Type" text null,
  "Distance_km" double precision null,
  "Start_Time" time without time zone null,
  "End_Time" time without time zone null,
  "Pace_km_h" double precision null,
  constraint activities_pkey primary key ("ActivityID"),
  constraint activities_RegistrationID_fkey foreign KEY ("RegistrationID") references "registrations" ("RegistrationID")
) TABLESPACE pg_default;
```

### 2. pending_activities (NEW - Required)
Create this table for treadmill activity approval workflow:

```sql
create table public."pending_activities" (
  "PendingID" text not null default gen_random_uuid()::text,
  "RegistrationID" text null,
  "Activity_Date" date null,
  "Exercise_Type" text null,
  "Distance_km" double precision null,
  "Start_Time" time without time zone null,
  "End_Time" time without time zone null,
  "Pace_km_h" double precision null,
  "Image_URL" text null,
  "Status" text null default 'pending',
  "Created_At" timestamp with time zone default now(),
  constraint pending_activities_pkey primary key ("PendingID"),
  constraint pending_activities_RegistrationID_fkey foreign KEY ("RegistrationID") references "registrations" ("RegistrationID")
) TABLESPACE pg_default;

-- Create index for faster queries
create index IF not exists idx_pending_activities_status on public."pending_activities" using btree ("Status") TABLESPACE pg_default;
create index IF not exists idx_pending_activities_registration on public."pending_activities" using btree ("RegistrationID") TABLESPACE pg_default;
```

## How It Works

### Exercise Type Flow

1. **Walk/Run**: 
   - User starts GPS tracking
   - Activity is recorded directly to "activities" table
   - No approval needed

2. **Treadmill**:
   - User inputs: Distance (km), Time (minutes), and Photo
   - Data is saved to "pending_activities" table with Status = 'pending'
   - ActivityID is auto-generated (PendingID)
   - Start_Time calculated as: End_Time - Time (from input)
   - End_Time = Upload Timestamp
   - Pace calculated as: Distance / (Time / 60)

### Admin Approval Flow

1. Admin views pending activities in Settings > Pending Approvals
2. Admin reviews:
   - Exercise Type
   - Date
   - Distance
   - Pace
   - Treadmill Screen Photo
3. Admin can:
   - **Approve**: Moves record to "activities" table and deletes from "pending_activities"
   - **Reject**: Deletes record from "pending_activities"

### 3. Social Posts (NEW - Required)
Create this table for the social media feed feature:

```sql
create table public."social_posts" (
  "id" bigserial primary key,
  "user_id" uuid not null references auth.users(id) on delete cascade,
  "photo_url" text null,
  "caption" text null,
  "activity_data" jsonb null,
  "created_at" timestamp with time zone default now() not null
) TABLESPACE pg_default;

-- Create index for faster queries
create index IF not exists idx_social_posts_user_id on public."social_posts" using btree ("user_id") TABLESPACE pg_default;
create index IF not exists idx_social_posts_created_at on public."social_posts" using btree ("created_at" desc) TABLESPACE pg_default;

-- Enable Row Level Security
alter table public."social_posts" enable row level security;

-- Policy to allow users to view all posts
create policy "Posts are viewable by everyone"
  on public."social_posts" for select
  using (true);

-- Policy to allow authenticated users to insert their own posts
create policy "Users can insert their own posts"
  on public."social_posts" for insert
  with check (auth.uid() = user_id);

-- Policy to allow users to delete their own posts
create policy "Users can delete their own posts"
  on public."social_posts" for delete
  using (auth.uid() = user_id);
```

### 4. Post Likes (NEW - Required)
Create this table to track post likes:

```sql
create table public."post_likes" (
  "id" bigserial primary key,
  "post_id" bigint not null references public."social_posts"(id) on delete cascade,
  "user_id" uuid not null references auth.users(id) on delete cascade,
  "created_at" timestamp with time zone default now() not null,
  constraint "unique_post_like" unique (post_id, user_id)
) TABLESPACE pg_default;

-- Create indexes for faster queries
create index IF not exists idx_post_likes_post_id on public."post_likes" using btree ("post_id") TABLESPACE pg_default;
create index IF not exists idx_post_likes_user_id on public."post_likes" using btree ("user_id") TABLESPACE pg_default;

-- Enable Row Level Security
alter table public."post_likes" enable row level security;

-- Policy to allow users to view all likes
create policy "Likes are viewable by everyone"
  on public."post_likes" for select
  using (true);

-- Policy to allow authenticated users to like posts
create policy "Users can like posts"
  on public."post_likes" for insert
  with check (auth.uid() = user_id);

-- Policy to allow users to unlike posts
create policy "Users can unlike posts"
  on public."post_likes" for delete
  using (auth.uid() = user_id);
```

## Social Feed Feature

### Post Structure
Posts can contain any combination of:
1. **Text** - Caption/message (optional)
2. **Photo** - Image URL (optional)
3. **Activity** - Today's activity data stored as JSONB (optional)
   - Activity_Date
   - Exercise_Type
   - Distance_km
   - Time
   - Pace_km_h

### User Interactions
- **Like**: Users can like/unlike posts
- **Delete**: Users can delete their own posts
- **View**: All users can view the community feed

### 5. Events (NEW - Required)
Create this table for managing running events and races:

```sql
create table public."events" (
  "eventId" text not null,
  "eventName" text null,
  "startsAt" date null,
  "endsAt" date null,
  "medal_min_daily_distance" double precision null,
  "medal_min_cumulative_distance" double precision null,
  "medal_date_start" date null,
  "medal_date_end" date null,
  constraint events_pkey primary key ("eventId")
) TABLESPACE pg_default;
```

**Medal Criteria Fields:**
- `medal_min_daily_distance`: Minimum km required per day to stay on medal list (if null, daily rule not enforced)
- `medal_min_cumulative_distance`: Minimum total km required over entire period (if null, cumulative rule not enforced)
- `medal_date_start`: Start date for medal tracking (can be different from event start)
- `medal_date_end`: End date for medal tracking (can be different from event end)

**Medal List Logic:**
- If `medal_min_daily_distance` is set: User must complete at least this distance EVERY day in the range to stay qualified
- If `medal_min_cumulative_distance` is set: User must complete at least this total distance over the entire range
- Both rules can be set simultaneously (user must meet both)
- Breaking the daily rule removes user from medal list

### 6. Events Participants (NEW - Required)
Create this table to track event registrations:

```sql
create table public."Events Participants" (
  "ParticipantID" text not null default gen_random_uuid()::text,
  "EventID" text not null,
  "RegistrationID" text not null,
  "Registration_Date" timestamp with time zone default now(),
  "Status" text default 'registered',
  "Days_Completed" integer default 0,
  constraint Events_Participants_pkey primary key ("ParticipantID"),
  constraint Events_Participants_EventID_fkey foreign key ("EventID") references "events" ("eventId") on delete cascade,
  constraint Events_Participants_RegistrationID_fkey foreign key ("RegistrationID") references "registrations" ("RegistrationID") on delete cascade,
  constraint unique_participant_per_event unique ("EventID", "RegistrationID")
) TABLESPACE pg_default;

-- Create indexes for faster queries
create index IF not exists idx_participants_event on public."Events Participants" using btree ("EventID") TABLESPACE pg_default;
create index IF not exists idx_participants_user on public."Events Participants" using btree ("RegistrationID") TABLESPACE pg_default;
```

### 7. event_enrollments (NEW - Required)
Create this table to track event enrollments (different from participants):

```sql
create table public."event_enrollments" (
  "EnrollmentID" text not null default gen_random_uuid()::text,
  "EventID" text not null,
  "RegistrationID" text null,
  "First_Name" text not null,
  "Other_Names" text not null,
  "Email" text not null,
  "Status" text default 'pending',
  "Enrolled_At" timestamp with time zone default now(),
  constraint Event_Enrollments_pkey primary key ("EnrollmentID"),
  constraint Event_Enrollments_EventID_fkey foreign key ("EventID") references "events" ("eventId") on delete cascade,
  constraint Event_Enrollments_RegistrationID_fkey foreign key ("RegistrationID") references "registrations" ("RegistrationID")
) TABLESPACE pg_default;

-- Create indexes for faster queries
create index IF not exists idx_enrollments_event on public."event_enrollments" using btree ("EventID") TABLESPACE pg_default;
create index IF not exists idx_enrollments_email on public."event_enrollments" using btree ("Email") TABLESPACE pg_default;
create index IF not exists idx_enrollments_status on public."event_enrollments" using btree ("Status") TABLESPACE pg_default;
```

## Events Feature

### Event Types
- **Race**: Competitive running event
- **Challenge**: Time-based or distance-based challenge
- **Marathon**: Long-distance running event
- **Fun Run**: Casual community event

### Event Management (Admin)
1. Create events with name, date, type, distance, location
2. Set maximum participants and registration deadline
3. Update event details
4. Delete events
5. View participant list
6. View enrollment list (First Name, Other Names, Email)

### Event Participation (Users)
1. **View Events**: Browse all active events
2. **Enroll**: Quick enrollment with basic info (name + email)
3. **Register**: Full registration via system account
4. **Track Progress**: View days completed for multi-day challenges
5. **Medal List**: See achievements with completed days count

### Enrollments vs Participants
- **Enrollments**: Quick signup with name/email from logged-in users (requires admin approval before becoming a participant)
  - Status: pending → Admin reviews → approved/rejected
  - Approved enrollments are moved to Event Participants table
- **Participants**: Full system users with tracking (linked to RegistrationID) who have been approved by admin

### Medal Calculation
- Medals are awarded based on "Days_Completed" field
- Admin or system tracks completion progress
- Medal list shows Event name, Participant name, and completion count

### 8. External Activity Submissions (NEW - Required)
Create this table for users to submit historical activities:

```sql
create table public."External Activity Submissions" (
  "SubmissionID" text not null default gen_random_uuid()::text,
  "RegistrationID" text not null,
  "Activity_Date" date not null,
  "Exercise_Type" text not null,
  "Start_Time" time without time zone not null,
  "Duration" text not null,
  "Distance_km" double precision not null,
  "Submitted_At" timestamp with time zone default now(),
  constraint External_Activity_Submissions_pkey primary key ("SubmissionID"),
  constraint External_Activity_Submissions_RegistrationID_fkey foreign key ("RegistrationID") references "registrations" ("RegistrationID") on delete cascade
) TABLESPACE pg_default;

-- Create indexes for faster queries
create index IF not exists idx_external_submissions_registration on public."External Activity Submissions" using btree ("RegistrationID") TABLESPACE pg_default;
create index IF not exists idx_external_submissions_date on public."External Activity Submissions" using btree ("Submitted_At" desc) TABLESPACE pg_default;
```

## External Activity Submission Flow

### User Submission
1. User clicks "Add External Activity" button
2. Form appears with fields:
   - Date (can be any date)
   - Exercise Type (Run, Walk, Treadmill)
   - Start Time (HH:MM)
   - Duration (HH:MM:SS format)
   - Distance (km)
3. Data is saved to "External Activity Submissions" table
4. User receives confirmation that submission is recorded

### Admin Notification
1. Admin views all submissions in admin dashboard
2. Each submission shows:
   - Registration ID
   - Submission timestamp
   - Activity details (date, type, start time, duration, distance)
3. Admin is notified when new submissions are added

### 9. Fitness Goals (NEW - Required)
Create this table for tracking user fitness pace goals:

```sql
create table public."fitness_goal" (
  "id" bigserial primary key,
  "registration_id" text not null,
  "target_pace_kmh" double precision not null,
  "target_date" date not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint fitness_goal_registration_id_fkey foreign key ("registration_id") references "registrations" ("RegistrationID") on delete cascade,
  constraint unique_fitness_goal_per_user unique ("registration_id")
) TABLESPACE pg_default;

-- Create index for faster queries
create index IF not exists idx_fitness_goal_registration on public."fitness_goal" using btree ("registration_id") TABLESPACE pg_default;
```

**Fitness Goal Logic:**
- Each user can have one active fitness goal (unique constraint on registration_id)
- `target_pace_kmh`: The target pace in km/h the user wants to achieve
- `target_date`: The date by which the user wants to achieve this pace
- Progress is measured as the average pace of the last 5 activities (or all activities if fewer than 5)
- Pace is stored as km/h but displayed as min/km in the UI

### 10. Weight Target Goal (NEW - Required)
Create this table for storing user weight loss targets:

```sql
create table public."weight_target_goal" (
  "id" bigserial primary key,
  "registration_id" text not null,
  "target_weight" double precision not null,
  "target_date" date not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint weight_target_goal_registration_id_fkey foreign key ("registration_id") references "registrations" ("RegistrationID") on delete cascade,
  constraint unique_weight_target_per_user unique ("registration_id")
) TABLESPACE pg_default;

create index IF not exists idx_weight_target_goal_registration on public."weight_target_goal" using btree ("registration_id") TABLESPACE pg_default;
```

### 11. Weight Goal Entries (NEW - Required)
Create this table for tracking weekly weight entries:

```sql
create table public."weight_goal" (
  "id" bigserial primary key,
  "registration_id" text not null,
  "weight" double precision not null,
  "date" date not null,
  "created_at" timestamp with time zone default now() not null,
  constraint weight_goal_registration_id_fkey foreign key ("registration_id") references "registrations" ("RegistrationID") on delete cascade
) TABLESPACE pg_default;

create index IF not exists idx_weight_goal_registration on public."weight_goal" using btree ("registration_id") TABLESPACE pg_default;
create index IF not exists idx_weight_goal_date on public."weight_goal" using btree ("date" desc) TABLESPACE pg_default;
```

**Weight Loss Goal Logic:**
- Each user can have one active weight target (unique constraint on registration_id in `weight_target_goal`)
- `target_weight`: The target weight in kg the user wants to reach
- `target_date`: The date by which the user wants to reach this weight
- Users log their weight on a weekly basis into the `weight_goal` table
- Progress is measured by comparing the latest weight entry against the target weight
- Progress percentage is calculated as: (starting_weight - current_weight) / (starting_weight - target_weight) * 100
- If a weight entry already exists for today, it is updated instead of inserting a duplicate

### 12. Health Goal (Existing)
This table tracks daily smartwatch health data with a computed overall_health_score:

```sql
create table public.health_goal (
  health_id serial not null,
  registration_id text not null,
  record_date date not null,
  heart_rate_bpm integer null,
  steps integer null,
  sleep_hours numeric(4, 2) null,
  blood_oxygen_spo2 numeric(4, 1) null,
  overall_health_score numeric GENERATED ALWAYS as (
    (
      (
        (
          ((COALESCE(heart_rate_bpm, 0))::numeric * 0.25) + ((COALESCE(steps, 0))::numeric * 0.0005)
        ) + (
          COALESCE(sleep_hours, (0)::numeric) * (10)::numeric
        )
      ) + (COALESCE(blood_oxygen_spo2, (0)::numeric) * 0.5)
    )
  ) STORED (6, 2) null,
  constraint health_goal_pkey primary key (health_id),
  constraint fk_registration foreign KEY (registration_id) references registrations ("RegistrationID")
) TABLESPACE pg_default;
```

**Health Goal Logic:**
- Users enter daily data from their smartwatch: steps, resting heart rate (bpm), sleep hours, blood oxygen SpO2 (%)
- Each user can have one entry per day (registration_id + record_date)
- If an entry already exists for today, it is updated instead of inserting a duplicate
- The database computes `overall_health_score` automatically using the formula above
- The app also computes a client-side health score (0-100) from the last 7 entries:
  - Steps score (25%): 10,000 steps = 100%
  - Heart rate score (25%): 60-100 bpm optimal range
  - Sleep score (25%): 7-9 hours optimal range
  - Blood Oxygen SpO2 score (25%): 95%+ = 100%, 90-95% = good, below 90% = low
- Health score is displayed as an overall percentage with breakdown by category

### 13. Self Discipline Goals (Existing)
Lookup table containing predefined discipline goals users can choose from:

```sql
create table public.self_discipline_goal (
  self_discipline_goal_id bigint generated by default as identity not null,
  created_at timestamp with time zone not null default now(),
  goal text null,
  goal_name text null,
  constraint self_discipline_goal_pkey primary key (self_discipline_goal_id)
) TABLESPACE pg_default;
```

### 14. User Self Discipline Goals (NEW - Required)
Junction table to track which discipline goals each user has selected (1-3 max):

```sql
create table public.user_self_discipline_goals (
  user_self_discipline_id bigint generated by default as identity not null,
  registration_id text not null,
  self_discipline_goal_id bigint not null,
  selected_at timestamp with time zone not null default now(),
  constraint user_self_discipline_goals_pkey primary key (user_self_discipline_id),
  constraint unique_user_discipline_goal unique (registration_id, self_discipline_goal_id),
  constraint fk_discipline_goal foreign key (self_discipline_goal_id) references self_discipline_goal (self_discipline_goal_id),
  constraint fk_registration foreign key (registration_id) references registrations ("RegistrationID")
) TABLESPACE pg_default;
```

**Self Discipline Goal Logic:**
- `self_discipline_goal` is a lookup table with predefined goals (goal_name + goal description)
- Users can select 1 to 3 goals from this list
- Selections are stored in `user_self_discipline_goals` junction table
- Progress is tracked against user exercise activity (streak days, active days, total distance)
- Unique constraint prevents duplicate selections per user per goal

### 15. App Ratings (NEW - Required)
Create this table for storing in-app user ratings:

```sql
create table public.app_ratings (
  rating_id bigint generated by default as identity not null,
  registration_id text not null,
  rating integer not null check (rating >= 1 and rating <= 5),
  feedback text null,
  created_at timestamp with time zone not null default now(),
  constraint app_ratings_pkey primary key (rating_id),
  constraint unique_user_rating unique (registration_id),
  constraint fk_registration foreign key (registration_id) references registrations ("RegistrationID")
) TABLESPACE pg_default;

create index IF not exists idx_app_ratings_registration on public.app_ratings using btree (registration_id) TABLESPACE pg_default;
```

**App Ratings Logic:**
- Each user can submit one rating (unique constraint on registration_id)
- If user rates again, the existing rating is updated (upsert)
- Rating is 1-5 stars with optional text feedback
- Ratings are visible in the admin dashboard with average score and breakdown
- When an app store link becomes available, the button will also redirect to the store

### 16. User Badges (Optional - for tracking badge award dates)
If you want to persist when badges were earned (optional, badges are computed dynamically from activities):

```sql
create table public.user_badges (
  badge_id bigint generated by default as identity not null,
  registration_id text not null,
  badge_type text not null check (badge_type in ('distance', 'activity_count')),
  milestone integer not null,
  earned_at timestamp with time zone not null default now(),
  constraint user_badges_pkey primary key (badge_id),
  constraint unique_user_badge unique (registration_id, badge_type, milestone),
  constraint fk_registration foreign key (registration_id) references registrations ("RegistrationID")
) TABLESPACE pg_default;

create index IF not exists idx_user_badges_registration on public.user_badges using btree (registration_id) TABLESPACE pg_default;
```

**Badge Logic:**
- Badges are computed dynamically from the `activities` table (no extra table strictly needed)
- Distance badges: 10km, 50km, 100km, then every 100km (200, 300, 400...)
- Activity count badges: every 10 activities (10, 20, 30...)
- Only Run, Walk, Treadmill activity types count toward badges
- Total earned badge count is displayed on the profile header icon
- Full badge grid (earned + locked) is shown on the profile page

### 17. Habit Declarations (NEW - Required)
Create this table for tracking user habit declarations and measuring commitment:

```sql
create table public.habit_declarations (
  declaration_id bigint generated by default as identity not null,
  registration_id text not null,
  activity_type text not null check (activity_type in ('Walk', 'Run', 'Treadmill')),
  target_amount numeric not null,
  unit text not null check (unit in ('steps', 'kilometers')),
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly', 'yearly')),
  start_date date not null,
  created_at timestamp with time zone not null default now(),
  is_active boolean not null default true,
  constraint habit_declarations_pkey primary key (declaration_id),
  constraint fk_habit_registration foreign key (registration_id) references registrations ("RegistrationID") on delete cascade
) tablespace pg_default;

create index if not exists idx_habit_declarations_registration on public.habit_declarations using btree (registration_id) tablespace pg_default;
create index if not exists idx_habit_declarations_active on public.habit_declarations using btree (registration_id, is_active) tablespace pg_default;
```

**Habit Declaration Logic:**
- Each user can have one active declaration at a time (`is_active = true`)
- When a new declaration is saved, previous active declarations are set to `is_active = false`
- `activity_type`: Walk, Run, or Treadmill
- `target_amount`: The numeric target (e.g., 3 for "3 kilometers" or 5000 for "5000 steps")
- `unit`: steps or kilometers
- `frequency`: daily, weekly, monthly, or yearly
- `start_date`: When the user starts tracking their commitment
- Declaration reads as: "I [activity_type] [target_amount] [unit] [frequency]"
- Example: "I Walk 3 kilometers daily"

**Commitment % Calculation:**
- Commitment is measured as the percentage of periods where the user met their declared target
- For **kilometers**: Activities from the `activities` table are filtered by `Exercise_Type` matching the declared `activity_type`, and `Distance_km` is summed per period
- For **steps**: Entries from `health_goal` table are used, summing `steps` per period
- Periods are calculated based on frequency:
  - **Daily**: Each day since `start_date` is a period. Did the user log >= target that day?
  - **Weekly**: Each 7-day block since `start_date`. Did the user log >= target total that week?
  - **Monthly**: Each calendar month. Did the user log >= target total that month?
  - **Yearly**: Each calendar year. Did the user log >= target total that year?
- Formula: `commitment_percent = (periods_met / periods_elapsed) * 100`
- Displayed with color coding: >= 70% green (Excellent/Good), 40-69% amber (Fair), < 40% red (Needs Work)

### 18. Orders to Deliver (NEW - Required)
Create this table for the Buy Now checkout flow:

```sql
create table public.orders_to_deliver (
  order_id text not null default gen_random_uuid()::text,
  user_id text not null,
  phone_number text not null,
  delivery_address text not null,
  delivery_time_slots text not null,
  items jsonb not null default '[]'::jsonb,
  total_amount double precision not null default 0,
  status text not null default 'pending',
  created_at timestamp with time zone not null default now(),
  constraint orders_to_deliver_pkey primary key (order_id),
  constraint orders_to_deliver_user_fkey foreign key (user_id) references registrations ("RegistrationID") on delete cascade
) tablespace pg_default;

create index if not exists idx_orders_to_deliver_user on public.orders_to_deliver using btree (user_id) tablespace pg_default;
create index if not exists idx_orders_to_deliver_status on public.orders_to_deliver using btree (status) tablespace pg_default;
create index if not exists idx_orders_to_deliver_created on public.orders_to_deliver using btree (created_at desc) tablespace pg_default;
```

**Orders to Deliver Logic:**
- `items` is stored as JSONB array with each item having: name, size, qty, price, subtotal
- `delivery_time_slots` stores the selected time slots as a comma-separated string
- Available delivery time slots: Morning (9-11AM), Noon (11AM-1PM), Afternoon (1-5PM), Evening (5-8PM)
- Status flow: pending → processing → shipped → delivered (or cancelled)
- Admin can view all orders and print/save delivery stickers for each order
- Stock is decremented when order is placed
- Cart is cleared after successful order placement

### 19. Suggestions (NEW - Required)
Create this table for capturing user suggestions from Settings:

```sql
create table public.suggestions (
  suggestion_id bigint generated by default as identity not null,
  registration_id text not null,
  suggestion text not null,
  created_at timestamp with time zone not null default now(),
  constraint suggestions_pkey primary key (suggestion_id),
  constraint fk_suggestion_registration foreign key (registration_id) references registrations ("RegistrationID") on delete cascade
) tablespace pg_default;

create index if not exists idx_suggestions_registration on public.suggestions using btree (registration_id) tablespace pg_default;
create index if not exists idx_suggestions_created_at on public.suggestions using btree (created_at desc) tablespace pg_default;
```

**Suggestions Logic:**
- Users submit suggestions from Settings > Suggestions
- Each suggestion is stored with the user's registration_id and timestamp
- Admin can view all suggestions in the Admin Dashboard > Suggestions tile
- Suggestions are displayed in reverse chronological order (newest first)

### 20. Contacts (NEW - Required)
Create this table for storing sensitive contact information separately from registrations:

```sql
create table public.contacts (
  contact_id uuid not null default gen_random_uuid (),
  regstration_id text null,
  country_code text null,
  phone integer null,
  email text null,
  ph_verified boolean not null default false,
  em_verified boolean not null default false,
  constraint contacts_pkey primary key (contact_id),
  constraint contacts_regstration_id_fkey foreign KEY (regstration_id) references registrations ("RegistrationID")
) TABLESPACE pg_default;

create index IF not exists idx_contacts_regstration_id on public.contacts using btree (regstration_id) TABLESPACE pg_default;
```

**Contacts Logic:**
- Contact info (phone, email, country code) is stored separately from the registrations table for security
- Collected during registration step 2 (Contacts) after the account is created
- `ph_verified` and `em_verified` track whether phone and email have been verified
- Verification updates these boolean flags when confirmed
- Each registration can have one contact record linked by `regstration_id`

## Notes

- FriendID is hidden from users (system-generated)
- ActivityID for activities is auto-incremented (series last count + 1)
- PendingID for pending_activities uses UUID generation
- eventId uses E1, E2, E3 series generation; ParticipantID uses UUID generation
- All pace values are stored as km/h but displayed as min/km in the UI
- Dates are displayed as dd mmm yyyy format (e.g., "15 Dec 2024")
- Social posts support text, photos, and activity data in any combination
- Post likes are tracked with a unique constraint to prevent duplicate likes
- Events can be active, completed, or cancelled
- Each user can only register once per event (unique constraint)
- External activity submissions must be for dates before today
- Admin can approve/reject external submissions with optional notes
