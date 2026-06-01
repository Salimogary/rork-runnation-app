update public.club_membership_request request
set
  status = 'approved',
  reviewed_at = coalesce(request.reviewed_at, now())
from public.clubs club
where request.request_type = 'membership'
  and request.status = 'pending'
  and request.club_id = club.club_id
  and (club.is_special_club = true or club.special_club_code is not null);

update public.club_membership_request request
set
  status = 'approved',
  reviewed_at = coalesce(request.reviewed_at, now())
from public.clubs club
where request.request_type = 'membership'
  and request.status = 'pending'
  and request.club_id is null
  and lower(trim(request.club)) = lower(trim(club.club_name))
  and (club.is_special_club = true or club.special_club_code is not null);
