import { http } from "./http";
import type { JobCreateRequest, JobCreateResponse, JobResponse } from "../types/api";

export async function createJob(payload: JobCreateRequest): Promise<JobCreateResponse> {
  const { data } = await http.post<JobCreateResponse>("/jobs", payload);
  return data;
}

export async function getJob(jobId: string): Promise<JobResponse> {
  const { data } = await http.get<JobResponse>(`/jobs/${jobId}`);
  return data;
}

export async function getReport(jobId: string, reportName: string): Promise<string> {
  const { data } = await http.get<string>(`/jobs/${jobId}/reports/${reportName}`, {
    responseType: "text" as const,
  });
  return data;
}

export async function getArtifactCsv(jobId: string, artifactName: string): Promise<string> {
  const { data } = await http.get<string>(`/jobs/${jobId}/artifacts/${artifactName}`, {
    responseType: "text" as const,
  });
  return data;
}

export async function getArchiveText(jobId: string, filePath: string): Promise<string> {
  const { data } = await http.get<string>(`/jobs/${jobId}/archive/${filePath}`, {
    responseType: "text" as const,
  });
  return data;
}

export async function listArchiveFiles(jobId: string): Promise<string[]> {
  const { data } = await http.get<{ archive_dir: string | null; files: string[] }>(`/jobs/${jobId}/archive`);
  return data.files || [];
}
