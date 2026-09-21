-- Explicitly requested demonstration content. Idempotent by project code.
-- Run before assigning the owner's temporary-password requirement.
begin;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where email='jcramos@hamdanstudiomanila.com' and role='admin' and is_active),true);
set local role authenticated;
do $$ declare project uuid; discipline uuid; person uuid=auth.uid(); begin
 if person is null then raise exception 'Active Dexter Admin account required'; end if;
 if exists(select 1 from public.projects where project_code='TEST-HSM-001') then return; end if;
 select discipline_id into discipline from public.profiles where id=person;
 project=public.save_project_contributors(null,jsonb_build_object(
   'name','TEST - Hamdan Studio Office Fit-Out',
   'project_code','TEST-HSM-001','client_name','Demo client - testing only',
   'description','Sample project for testing project edits, task assignment, status changes and progress. All content is fictional.',
   'project_type','Office fit-out','location','Manila - demo site','status','ongoing','priority','medium',
   'start_date',current_date-7,'target_date',current_date+30
 ),array[discipline]);
 perform public.save_project_contributors(project,jsonb_build_object('project_architect',person),array[discipline]);
 insert into public.tasks(project_id,discipline_id,owner,task_name,status,priority,start_date,due_date,percent_complete,notes,progress_note)
 select project,discipline,person,title,state,importance,current_date-3,current_date+days,progress,
 'TEST DATA: sample architectural scope. Safe to edit during testing.',note
 from (values
 ('TEST - Review client brief','completed','medium',-2,100,'Brief reviewed; sample task completed.'),
 ('TEST - Prepare space planning','in_progress','high',3,45,'Initial zoning and circulation study in progress.'),
 ('TEST - Coordinate reflected ceiling plan','for_review','medium',5,85,'Draft ready for internal review.'),
 ('TEST - Confirm material specifications','blocked','critical',-1,20,'Waiting for sample client finish selection.'),
 ('TEST - Develop construction details','not_started','high',10,0,'Start after layout approval.'),
 ('TEST - Compile drawing package','not_started','medium',14,0,'Package checklist prepared for testing.')
 ) as sample(title,state,importance,days,progress,note);
 insert into public.milestones(project_id,discipline_id,name,due_date,status,owner,progress)
 values(project,discipline,'TEST - Concept design submission',current_date+7,'in_progress',person,40);
 insert into public.deliverables(project_id,discipline_id,title,owner,due_date,status)
 values(project,discipline,'TEST - Architectural concept package',person,current_date+7,'draft');
 insert into public.issues(project_id,discipline_id,issue_number,title,description,severity,owner,due_date)
 values(project,discipline,'TEST-ISS-001','TEST - Ceiling clearance coordination','Fictional clearance conflict for workflow testing.','critical',person,current_date+4);
 insert into public.rfis(project_id,discipline_id,rfi_number,subject,question,owner,due_date)
 values(project,discipline,'TEST-RFI-001','TEST - Confirm finish selection','Fictional request: confirm the sample flooring finish.',person,current_date+3);
end $$;
commit;
