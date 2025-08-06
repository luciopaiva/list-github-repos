# GitHub Repository Lister

A Node.js application that lists all repositories for a given GitHub user, including both public and private repositories, and exports the data to a CSV file.

## Features

- Lists all repositories (public and private) for a GitHub user
- Fetches detailed information including:
  - Repository name and description
  - Public/private status
  - Number of stars and forks
  - Commit count
  - Last commit date
  - Creation and update dates
  - Primary programming language
  - Repository size
- Exports data to CSV format
- Supports multiple credential methods

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure GitHub credentials (choose one method):**

   ### Method 1: Environment Variable (Recommended)
   Create a `.env` file in the project root:
   ```env
   GITHUB_TOKEN=your_github_personal_access_token_here
   ```

   ### Method 2: Credentials File
   Create a `credentials.json` file in the project root:
   ```json
   {
     "github_token": "your_github_personal_access_token_here"
   }
   ```

## Getting a GitHub Personal Access Token

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token"
3. Select the following scopes:
   - `repo` (for private repositories)
   - `public_repo` (for public repositories)
   - `user` (for user information)
4. Copy the generated token

## Usage

```bash
# Basic usage
node index.js <github-username>

# Specify custom output file
node index.js <github-username> output-filename.csv

# Using npm script
npm start <github-username>
```

### Examples

```bash
# List repositories for user "octocat"
node index.js octocat

# List repositories with custom output file
node index.js octocat my-repos.csv
```

## Output

The application generates a CSV file with the following columns:

- **Repository Name**: The name of the repository
- **Full Name**: Owner/repository format
- **Private**: Whether the repository is private (true/false)
- **Description**: Repository description
- **URL**: GitHub URL to the repository
- **Stars**: Number of stars
- **Forks**: Number of forks
- **Primary Language**: Main programming language
- **Commit Count**: Total number of commits
- **Last Commit Date**: Date of the most recent commit
- **Created Date**: Repository creation date
- **Updated Date**: Last update date
- **Size (KB)**: Repository size in kilobytes

## Security Notes

- Never commit your credentials to version control
- The `.env` and `credentials.json` files are ignored by git (see `.gitignore`)
- Use environment variables in production environments
- Regularly rotate your GitHub tokens

## Error Handling

The application handles common errors:
- Invalid or missing GitHub token
- User not found
- Network connectivity issues
- Rate limiting (automatically handled by Octokit)

## Dependencies

- **@octokit/rest**: GitHub API client
- **csv-writer**: CSV file generation
- **dotenv**: Environment variable loading

## License

MIT
