UPDATE internal_bids
SET status = 'submitted'
WHERE deal_number = 'B083126-04';
--> statement-breakpoint
DELETE FROM deal_finalizations
WHERE deal_number = 'B083126-04';
