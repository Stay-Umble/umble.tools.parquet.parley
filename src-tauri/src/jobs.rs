use crate::models::{JobState, JobStatus};
use std::collections::HashMap;
use uuid::Uuid;

#[derive(Debug, Default)]
pub struct JobRegistry {
    jobs: HashMap<String, JobStatus>,
}

impl JobRegistry {
    pub fn insert(&mut self, state: JobState, message: Option<String>) -> String {
        let job_id = Uuid::new_v4().to_string();
        self.jobs.insert(
            job_id.clone(),
            JobStatus {
                job_id: job_id.clone(),
                state,
                message,
                progress: None,
            },
        );
        job_id
    }

    pub fn complete(&mut self, job_id: &str, message: Option<String>) {
        self.set(job_id, JobState::Completed, message, Some(1.0));
    }

    pub fn fail(&mut self, job_id: &str, message: String) {
        self.set(job_id, JobState::Failed, Some(message), Some(1.0));
    }

    pub fn cancel(&mut self, job_id: &str) -> Option<JobStatus> {
        self.set(
            job_id,
            JobState::Cancelled,
            Some("Cancellation requested.".to_string()),
            Some(1.0),
        );
        self.jobs.get(job_id).cloned()
    }

    pub fn get(&self, job_id: &str) -> Option<JobStatus> {
        self.jobs.get(job_id).cloned()
    }

    fn set(
        &mut self,
        job_id: &str,
        state: JobState,
        message: Option<String>,
        progress: Option<f32>,
    ) {
        if let Some(job) = self.jobs.get_mut(job_id) {
            job.state = state;
            job.message = message;
            job.progress = progress;
        }
    }
}
