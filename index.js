const { Octokit } = require('@octokit/rest');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const FETCH_COMMIT_COUNT = false;
const CONCURRENCY_LIMIT = 10;

class GitHubRepoLister {
  constructor() {
    this.octokit = null;
    this.initializeClient();
  }

  initializeClient() {
    // Try to get credentials from environment variables first
    let token = process.env.GITHUB_TOKEN;

    // If no env variable, try to read from credentials file
    if (!token) {
      try {
        const credentialsPath = path.join(__dirname, 'credentials.json');
        if (fs.existsSync(credentialsPath)) {
          const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
          token = credentials.github_token;
        }
      } catch (error) {
        console.warn('Could not read credentials file:', error.message);
      }
    }

    if (!token) {
      console.error('GitHub token not found. Please provide it via:');
      console.error('1. Environment variable: GITHUB_TOKEN');
      console.error('2. credentials.json file with format: {"github_token": "your_token_here"}');
      process.exit(1);
    }

    this.octokit = new Octokit({
      auth: token,
    });

    console.log('GitHub client initialized successfully');
  }

  async getUserRepos(username) {
    try {
      console.log(`Fetching repositories for user: ${username}`);
      
      // First, get the authenticated user to check if we're querying our own repos
      const authenticatedUser = await this.octokit.rest.users.getAuthenticated();
      const isOwnRepos = authenticatedUser.data.login.toLowerCase() === username.toLowerCase();
      
      let repos;
      
      if (isOwnRepos) {
        console.log('Fetching your own repositories (including private ones)...');
        // Use listForAuthenticatedUser to get all repos including private ones
        repos = await this.octokit.paginate(this.octokit.rest.repos.listForAuthenticatedUser, {
          visibility: 'all', // all, public, private
          affiliation: 'owner', // owner, collaborator, organization_member
          sort: 'updated',
          per_page: 100,
        });
      } else {
        console.log('Fetching repositories for another user (public only)...');
        // Use listForUser for other users (only public repos will be visible)
        repos = await this.octokit.paginate(this.octokit.rest.repos.listForUser, {
          username: username,
          type: 'all',
          per_page: 100,
        });
      }

      console.log(`Found ${repos.length} repositories`);
      return repos;
    } catch (error) {
      console.error('Error fetching repositories:', error.message);
      if (error.status === 404) {
        console.error('User not found or you don\'t have access to their repositories');
      } else if (error.status === 401) {
        console.error('Invalid GitHub token or insufficient permissions');
      }
      throw error;
    }
  }

  async getRepoCommitInfo(owner, repo) {
    try {
      // Get the default branch first
      const repoInfo = await this.octokit.rest.repos.get({
        owner: owner,
        repo: repo,
      });

      const defaultBranch = repoInfo.data.default_branch;

      // Get commits for the default branch
      const commits = await this.octokit.rest.repos.listCommits({
        owner: owner,
        repo: repo,
        sha: defaultBranch,
        per_page: 1, // We only need the latest commit for the date
      });

      // Get total commit count by getting all commits (this might be slow for repos with many commits)
      const allCommits = FETCH_COMMIT_COUNT ? await this.octokit.paginate(this.octokit.rest.repos.listCommits, {
        owner: owner,
        repo: repo,
        sha: defaultBranch,
        per_page: 100,
      }) : [];

      return {
        commitCount: FETCH_COMMIT_COUNT ? allCommits.length : -1,
        lastCommitDate: commits.data.length > 0 ? commits.data[0].commit.committer.date : null,
      };
    } catch (error) {
      console.warn(`Could not fetch commit info for ${owner}/${repo}:`, error.message);
      return {
        commitCount: 0,
        lastCommitDate: null,
      };
    }
  }

  // Helper function to process items concurrently with a limit
  async processConcurrently(items, processor, concurrency = CONCURRENCY_LIMIT) {
    const results = [];
    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      const batchPromises = batch.map(async (item, index) => {
        const globalIndex = i + index;
        console.log(`Processing ${globalIndex + 1}/${items.length}: ${item.name}`);
        return processor(item, globalIndex);
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    return results;
  }

  async processRepositories(username) {
    const repos = await this.getUserRepos(username);

    console.log('Processing repository details...');
    console.log(`Using concurrency limit: ${CONCURRENCY_LIMIT}`);
    
    // Define the processor function for each repository
    const processRepo = async (repo, index) => {
      // Get commit information
      const commitInfo = await this.getRepoCommitInfo(repo.owner.login, repo.name);

      const repoData = {
        name: repo.name,
        fullName: repo.full_name,
        private: repo.private,
        archived: repo.archived,
        fork: repo.fork,
        forkedFrom: repo.fork && repo.parent ? repo.parent.full_name : '',
        description: repo.description || '',
        url: repo.html_url,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        language: repo.language || 'N/A',
        createdAt: repo.created_at,
        updatedAt: repo.updated_at,
        commitCount: commitInfo.commitCount,
        lastCommitDate: commitInfo.lastCommitDate,
        size: repo.size, // Size in KB
      };

      return repoData;
    };

    // Process repositories concurrently
    const processedRepos = await this.processConcurrently(repos, processRepo, CONCURRENCY_LIMIT);

    return processedRepos;
  }

  async generateCSV(repositories, outputPath) {
    const csvWriter = createCsvWriter({
      path: outputPath,
      header: [
        { id: 'name', title: 'Repository Name' },
        { id: 'fullName', title: 'Full Name' },
        { id: 'private', title: 'Private' },
        { id: 'archived', title: 'Archived' },
        { id: 'fork', title: 'Is Fork' },
        { id: 'forkedFrom', title: 'Forked From' },
        { id: 'description', title: 'Description' },
        { id: 'url', title: 'URL' },
        { id: 'stars', title: 'Stars' },
        { id: 'forks', title: 'Forks' },
        { id: 'language', title: 'Primary Language' },
        { id: 'commitCount', title: 'Commit Count' },
        { id: 'lastCommitDate', title: 'Last Commit Date' },
        { id: 'createdAt', title: 'Created Date' },
        { id: 'updatedAt', title: 'Updated Date' },
        { id: 'size', title: 'Size (KB)' },
      ],
    });

    await csvWriter.writeRecords(repositories);
    console.log(`CSV file generated: ${outputPath}`);
  }

  async run(username, outputFile = null) {
    try {
      if (!username) {
        console.error('Please provide a GitHub username');
        console.log('Usage: node index.js <username> [output-file.csv]');
        process.exit(1);
      }

      // Generate timestamp for filename
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19); // Format: 2025-08-06T13-15-30
      
      const outputPath = outputFile || `${username}-repositories-${timestamp}.csv`;
      
      console.log('Starting GitHub repository analysis...');
      
      // Check if we're analyzing our own repos
      const authenticatedUser = await this.octokit.rest.users.getAuthenticated();
      const isOwnRepos = authenticatedUser.data.login.toLowerCase() === username.toLowerCase();
      
      const repositories = await this.processRepositories(username);
      await this.generateCSV(repositories, outputPath);
      
      console.log('\n=== Summary ===');
      if (isOwnRepos) {
        console.log(`Analyzed your own repositories (including private ones)`);
      } else {
        console.log(`Analyzed repositories for user: ${username} (public only)`);
      }
      console.log(`Total repositories: ${repositories.length}`);
      console.log(`Private repositories: ${repositories.filter(r => r.private).length}`);
      console.log(`Public repositories: ${repositories.filter(r => !r.private).length}`);
      console.log(`Archived repositories: ${repositories.filter(r => r.archived).length}`);
      console.log(`Forked repositories: ${repositories.filter(r => r.fork).length}`);
      console.log(`Original repositories: ${repositories.filter(r => !r.fork).length}`);
      console.log(`Total stars: ${repositories.reduce((sum, r) => sum + r.stars, 0)}`);
      console.log(`Output saved to: ${outputPath}`);
      
    } catch (error) {
      console.error('Application error:', error.message);
      process.exit(1);
    }
  }
}

// Main execution
if (require.main === module) {
  const username = process.argv[2];
  const outputFile = process.argv[3];
  
  const lister = new GitHubRepoLister();
  lister.run(username, outputFile);
}

module.exports = GitHubRepoLister;
