export interface GitHubRepository {
    id: number;
    name: string;
    fullName: string;
    owner: string;
    private: boolean;
}

export interface GitHubInstallation {
    id: number;
    accountLogin: string;
    accountType: string;
    htmlUrl: string;
}

export interface GitHubProject {
    id: string;
    number: number;
    title: string;
    owner: string;
    statusFields: { id: string; name: string; options: { id: string; name: string }[] }[];
}
