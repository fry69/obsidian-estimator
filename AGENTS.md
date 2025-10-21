This is about the pull request queue at https://github.com/obsidianmd/obsidian-releases/pulls

This project manually reviews pull requests for plugins and themes. This can take weeks to months.

I want to create a web site that visualizes a timeline of accepted pull requests (differentiate between plugins and themes), shows the current queue size (all/plugins/themes) and show a rough estimate how long the wait time until review is.

The magic sauce is that reviews happen chronologically in order as PRs were first opened, so that pull request number/id can be used as a queue indicator.

This only gets slightly complicated as themes seems get accepted much quicker and might break this rule, but it still seems to be true for plugins.

Also note that there are **A LOT** of invalid PRs. Only consider PRs that are marked/tagged with "Ready for review".

Plugins have the "plugin" tag. Themes have the "theme" tag.

Below are a mockup implementation and and an earlier analysis about this project, which recommended other libraries/frameworks, which I do not like.

---
Mockup implementation

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Obsidian Release PR Queue Status</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <!-- Chosen Palette: Slate and Sky Blue -->
    <!-- Application Structure Plan: A dashboard design is chosen for its effectiveness in presenting key information hierarchically. The top-level consists of key performance indicators (KPIs) like queue size and estimated wait time, offering an immediate snapshot. This is followed by a historical trend chart showing review velocity, which provides context to the current numbers. Finally, a detailed, filterable table of the current queue allows users to drill down into specific items. This top-down structure (summary -> trend -> detail) is highly intuitive for users wanting to understand both the current state and the underlying dynamics of the PR queue. -->
    <!-- Visualization & Content Choices:
        - Report Info: Current number of open PRs (Total, Plugins, Themes). Goal: Inform. Viz/Method: Large number KPI cards. Interaction: Static. Justification: Provides a quick, at-a-glance understanding of the current backlog size. Library: HTML/Tailwind.
        - Report Info: Estimated wait time for a new plugin PR. Goal: Inform. Viz/Method: KPI card with calculated metric. Interaction: Static. Justification: Answers the most critical question for developers submitting new plugins. Library: HTML/Tailwind, logic in JS.
        - Report Info: Historical PR review/merge rate. Goal: Show Change Over Time. Viz/Method: Stacked Bar Chart. Interaction: Buttons to filter data by type (All, Plugins, Themes) and tooltips on hover for details. Justification: Visualizes the review team's throughput and helps users understand if the queue is growing or shrinking. Library: Chart.js (Canvas).
        - Report Info: List of all PRs currently in the queue. Goal: Organize/Detail. Viz/Method: HTML Table. Interaction: Links to GitHub PRs. Justification: Offers full transparency and allows users to explore the specific items that make up the queue statistics. Library: HTML/Tailwind, populated by JS.
    -->
    <!-- CONFIRMATION: NO SVG graphics used. NO Mermaid JS used. -->
    <style>
        body {
            font-family: 'Inter', sans-serif;
            background-color: #f8fafc; /* slate-50 */
        }
        .metric-card {
            background-color: white;
            border-radius: 0.75rem;
            box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
            padding: 1.5rem;
            text-align: center;
            transition: transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
        }
        .metric-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
        }
        .chart-container {
            position: relative;
            width: 100%;
            max-width: 900px;
            margin-left: auto;
            margin-right: auto;
            height: 400px;
            max-height: 50vh;
        }
    </style>
</head>
<body class="text-slate-800">

    <div class="container mx-auto p-4 md:p-8">
        <header class="text-center mb-10">
            <h1 class="text-4xl font-bold text-slate-900">Obsidian Release PR Queue</h1>
            <p class="mt-2 text-lg text-slate-600">Dashboard for community plugin & theme submissions.</p>
        </header>

        <main>
            <!-- Key Metrics -->
            <section id="key-metrics" class="mb-10">
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div class="metric-card">
                        <h3 class="text-lg font-semibold text-slate-500">Estimated Plugin Wait</h3>
                        <p id="wait-time" class="text-5xl font-bold text-sky-600 mt-2">-- days</p>
                        <p class="text-sm text-slate-400 mt-1">Based on recent review velocity</p>
                    </div>
                    <div class="metric-card">
                        <h3 class="text-lg font-semibold text-slate-500">Total Queue Size</h3>
                        <p id="total-queue" class="text-5xl font-bold text-slate-700 mt-2">--</p>
                        <p class="text-sm text-slate-400 mt-1">PRs "Ready for review"</p>
                    </div>
                    <div class="metric-card">
                        <h3 class="text-lg font-semibold text-slate-500">Plugin Queue</h3>
                        <p id="plugin-queue" class="text-5xl font-bold text-slate-700 mt-2">--</p>
                        <p class="text-sm text-slate-400 mt-1">"plugin" & "Ready for review"</p>
                    </div>
                    <div class="metric-card">
                        <h3 class="text-lg font-semibold text-slate-500">Theme Queue</h3>
                        <p id="theme-queue" class="text-5xl font-bold text-slate-700 mt-2">--</p>
                        <p class="text-sm text-slate-400 mt-1">"theme" & "Ready for review"</p>
                    </div>
                </div>
            </section>

            <!-- Timeline Chart -->
            <section class="mb-10 bg-white p-6 rounded-xl shadow-lg">
                 <div class="flex flex-col md:flex-row justify-between items-center mb-4">
                    <div class="text-center md:text-left">
                        <h2 class="text-2xl font-bold text-slate-800">Merged PRs Timeline</h2>
                        <p class="text-slate-500">Represents the number of plugins and themes approved per week.</p>
                    </div>
                    <div id="chart-filters" class="flex space-x-2 mt-4 md:mt-0" role="group">
                        <button data-type="all" class="filter-btn bg-sky-600 text-white px-4 py-2 rounded-md font-semibold shadow">All</button>
                        <button data-type="plugin" class="filter-btn bg-white text-slate-700 px-4 py-2 rounded-md font-semibold shadow">Plugins</button>
                        <button data-type="theme" class="filter-btn bg-white text-slate-700 px-4 py-2 rounded-md font-semibold shadow">Themes</button>
                    </div>
                </div>
                <div class="chart-container">
                    <canvas id="merged-prs-chart"></canvas>
                </div>
            </section>

             <!-- Current Queue Table -->
            <section class="bg-white p-6 rounded-xl shadow-lg">
                <h2 class="text-2xl font-bold text-slate-800 mb-4">Current "Ready for review" Queue</h2>
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-slate-200">
                        <thead class="bg-slate-50">
                            <tr>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">PR #</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Type</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Title</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Submitted</th>
                            </tr>
                        </thead>
                        <tbody id="queue-table-body" class="bg-white divide-y divide-slate-200">
                           <tr><td colspan="4" class="text-center p-8 text-slate-500">Loading data...</td></tr>
                        </tbody>
                    </table>
                </div>
            </section>
        </main>

        <footer class="text-center mt-12 py-6 border-t border-slate-200">
            <p class="text-sm text-slate-500">This is a mock-up using sample data. All calculations are estimates. Not affiliated with Obsidian MD.</p>
        </footer>
    </div>

<script>
document.addEventListener('DOMContentLoaded', () => {

    const MOCK_DAYS_OF_DATA = 90;
    const MOCK_VELOCITY_WEEKS = 12;

    function generateMockData() {
        const openPrs = [];
        const mergedPrs = [];
        const now = new Date();

        for (let i = 0; i < 250; i++) {
            const daysAgo = Math.floor(Math.random() * MOCK_DAYS_OF_DATA);
            const createdAt = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
            const type = Math.random() > 0.15 ? 'plugin' : 'theme';
            const id = 1000 + i;

            const isMerged = Math.random() > 0.6;
            const isReady = Math.random() > 0.3;

            if (isMerged) {
                const mergeDelay = Math.floor(Math.random() * 30) + 7;
                const mergedAt = new Date(createdAt.getTime() + mergeDelay * 24 * 60 * 60 * 1000);
                 if (mergedAt < now) {
                     mergedPrs.push({
                        id,
                        title: `feat: Add new amazing ${type} ${id}`,
                        created_at: createdAt.toISOString(),
                        merged_at: mergedAt.toISOString(),
                        labels: [{ name: type }]
                    });
                }
            } else if(isReady) {
                 openPrs.push({
                    id,
                    html_url: `https://github.com/obsidianmd/obsidian-releases/pull/${id}`,
                    title: `feat: New awesome ${type} ${id}`,
                    created_at: createdAt.toISOString(),
                    labels: [{ name: 'Ready for review' }, { name: type }]
                });
            }
        }
        return { openPrs, mergedPrs };
    }

    const { openPrs, mergedPrs } = generateMockData();

    const readyForReviewPrs = openPrs.filter(pr => pr.labels.some(label => label.name === 'Ready for review'));
    const readyPlugins = readyForReviewPrs.filter(pr => pr.labels.some(label => label.name === 'plugin'));
    const readyThemes = readyForReviewPrs.filter(pr => pr.labels.some(label => label.name === 'theme'));

    function updateKpiCards() {
        document.getElementById('total-queue').textContent = readyForReviewPrs.length;
        document.getElementById('plugin-queue').textContent = readyPlugins.length;
        document.getElementById('theme-queue').textContent = readyThemes.length;
    }

    function calculateWaitTime() {
        const now = new Date();
        const twelveWeeksAgo = new Date(now.getTime() - MOCK_VELOCITY_WEEKS * 7 * 24 * 60 * 60 * 1000);

        const recentMergedPlugins = mergedPrs.filter(pr => {
            const mergedDate = new Date(pr.merged_at);
            const isPlugin = pr.labels.some(label => label.name === 'plugin');
            return isPlugin && mergedDate > twelveWeeksAgo;
        });

        const pluginsPerWeek = recentMergedPlugins.length / MOCK_VELOCITY_WEEKS;

        if (pluginsPerWeek > 0) {
            const waitWeeks = readyPlugins.length / pluginsPerWeek;
            const waitDays = Math.round(waitWeeks * 7);
            document.getElementById('wait-time').textContent = `${waitDays} days`;
        } else {
            document.getElementById('wait-time').textContent = `∞ days`;
        }
    }

    function populateQueueTable() {
        const tableBody = document.getElementById('queue-table-body');
        tableBody.innerHTML = '';

        if (readyForReviewPrs.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="4" class="text-center p-8 text-slate-500">The queue is empty!</td></tr>`;
            return;
        }

        readyForReviewPrs.sort((a,b) => new Date(a.created_at) - new Date(b.created_at));

        readyForReviewPrs.forEach(pr => {
            const typeLabel = pr.labels.find(l => l.name === 'plugin' || l.name === 'theme');
            const type = typeLabel ? typeLabel.name : 'N/A';
            const submittedDate = new Date(pr.created_at);

            const row = document.createElement('tr');
            row.className = 'hover:bg-slate-50';
            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                    <a href="${pr.html_url}" target="_blank" class="text-sky-600 hover:text-sky-800">#${pr.id}</a>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${type === 'plugin' ? 'bg-sky-100 text-sky-800' : 'bg-pink-100 text-pink-800'}">
                        ${type}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 truncate" style="max-width: 300px;">${pr.title}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500">${submittedDate.toLocaleDateString()}</td>
            `;
            tableBody.appendChild(row);
        });
    }

    let chartInstance = null;
    function renderTimelineChart(filterType = 'all') {
        const ctx = document.getElementById('merged-prs-chart').getContext('2d');
        const weeklyData = {};

        const filteredPrs = mergedPrs.filter(pr => {
            if (filterType === 'all') return true;
            return pr.labels.some(label => label.name === filterType);
        });

        filteredPrs.forEach(pr => {
            const mergedDate = new Date(pr.merged_at);
            const weekStart = new Date(mergedDate);
            weekStart.setDate(mergedDate.getDate() - mergedDate.getDay());
            weekStart.setHours(0,0,0,0);
            const weekKey = weekStart.toISOString().split('T')[0];

            if (!weeklyData[weekKey]) {
                weeklyData[weekKey] = { plugins: 0, themes: 0 };
            }
            if (pr.labels.some(label => label.name === 'plugin')) {
                weeklyData[weekKey].plugins++;
            } else if (pr.labels.some(label => label.name === 'theme')) {
                weeklyData[weekKey].themes++;
            }
        });

        const sortedWeeks = Object.keys(weeklyData).sort();
        const last12Weeks = sortedWeeks.slice(-12);

        const labels = last12Weeks.map(week => new Date(week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        const pluginCounts = last12Weeks.map(week => weeklyData[week].plugins);
        const themeCounts = last12Weeks.map(week => weeklyData[week].themes);

        const datasets = [];
        if (filterType === 'all' || filterType === 'plugin') {
            datasets.push({
                label: 'Plugins Merged',
                data: pluginCounts,
                backgroundColor: 'rgb(2, 132, 199)', // sky-600
                borderColor: 'rgb(2, 132, 199)',
                borderWidth: 1
            });
        }
        if (filterType === 'all' || filterType === 'theme') {
            datasets.push({
                label: 'Themes Merged',
                data: themeCounts,
                backgroundColor: 'rgb(219, 39, 119)', // pink-600
                borderColor: 'rgb(219, 39, 119)',
                borderWidth: 1
            });
        }

        if (chartInstance) {
            chartInstance.destroy();
        }

        chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        stacked: true,
                        grid: { display: false }
                    },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        ticks: {
                           stepSize: 1
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                    }
                }
            }
        });
    }

    document.querySelectorAll('.filter-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const filterType = e.target.dataset.type;

            document.querySelectorAll('.filter-btn').forEach(btn => {
                btn.classList.remove('bg-sky-600', 'text-white');
                btn.classList.add('bg-white', 'text-slate-700');
            });

            e.target.classList.add('bg-sky-600', 'text-white');
            e.target.classList.remove('bg-white', 'text-slate-700');

            renderTimelineChart(filterType);
        });
    });

    updateKpiCards();
    calculateWaitTime();
    populateQueueTable();
    renderTimelineChart();
});
</script>

</body>
</html>
```

---

# **Architectural Blueprint for the Obsidian Release Queue Analytics Platform**

## **Strategic and Feasibility Analysis**

This analysis establishes the project's foundation by validating its core assumptions, defining a high-level technical strategy, and assessing the available tools. The proposed architecture prioritizes efficiency, accuracy, and low operational overhead to deliver a valuable and sustainable tool for the Obsidian developer community.

### **Project Viability and Core Assumption Validation**

The proposed project is unequivocally feasible from a technical standpoint. The GitHub REST API provides all necessary data points to build the desired analytics platform. Key data fields such as pull request (PR) creation dates (created\_at), merge/closure dates (closed\_at, merged\_at), current state (open or closed), and associated labels are readily accessible through various API endpoints.1 The primary challenge is not a lack of data, but rather its efficient and accurate collection, processing, and interpretation.

The central hypothesis underpinning the project's predictive capability is that pull requests are reviewed chronologically based on their creation date. This assumption, which enables the use of PR numbers as a queue indicator, must be treated as a hypothesis to be validated with data. The implementation plan will involve fetching a substantial historical dataset of merged "plugin" PRs. By plotting the created\_at timestamp against the merged\_at timestamp for each PR, it is possible to statistically verify this assumption. A strong positive correlation and a tight grouping of data points around a trendline would provide the necessary validation.

The user's observation that themes may follow a different, faster review cycle must also be addressed. The same correlation analysis should be performed independently for theme-related PRs. This will likely reveal a distinct trendline, quantifying the difference in review velocity. Consequently, the wait-time estimation algorithm must be bifurcated, employing separate predictive models for plugins and themes to ensure accuracy.

It is critical to recognize that the project's value is directly tied to the stability of the Obsidian team's internal review process. Any significant change in their workflow—such as prioritizing certain PRs based on complexity, batch processing, or other criteria—could invalidate the chronological assumption and degrade the accuracy of the wait-time estimations. A system that only displays a calculated number without acknowledging this dependency is inherently fragile. To build a more robust and trustworthy tool, the system should continuously re-validate its own underlying assumptions. This can be achieved by implementing a "model confidence" or "data consistency" metric. For instance, the data ingestion service can calculate the standard deviation of review times or the correlation coefficient for the last 'N' merged PRs. If this metric degrades past a predefined threshold, the website could display a notice, such as "Wait time estimates may be less accurate due to recent changes in review patterns." This transforms the tool from a simple data display into a more sophisticated and transparent analytical platform.

### **Data Acquisition Architecture: The Critical API Endpoint Choice**

The primary technical task is to fetch two distinct datasets: all *open* PRs with the "Ready for review" label, and a historical set of *closed/merged* PRs with the same label, with each set further segmented by "plugin" and "theme" labels. The choice of the GitHub API endpoint for this task is the single most important architectural decision, with profound implications for the project's efficiency, scalability, and long-term viability.

An evaluation of available endpoints reveals a clear optimal choice:

* **GET /repos/{owner}/{repo}/pulls**: While seemingly the most direct endpoint, it is fundamentally unsuitable for this project. The API documentation confirms that this endpoint can filter by state (e.g., open, closed) but critically lacks a parameter to filter by labels.1 Using this endpoint would necessitate fetching all open PRs—potentially hundreds of pages of data—and performing the filtering on the client-side. This approach is grossly inefficient and would rapidly exhaust API rate limits, rendering the application slow and unreliable.
* **GET /repos/{owner}/{repo}/issues**: The GitHub API treats every pull request as an issue, and shared attributes like labels are managed through the Issues API.1 This endpoint is an improvement as it allows filtering by a comma-separated list of labels.4 However, it returns both issues and pull requests, which would still require a client-side step to isolate the PRs.
* **GET /search/issues (Recommended)**: This is the optimal endpoint for this project's needs. The search API provides a powerful query language that allows for complex, server-side filtering.5 This enables the construction of precise queries to retrieve exactly the required data in a single, efficient operation.

The following queries exemplify the efficiency of the search endpoint:

* To find the current open plugin queue:
  q=is:pr+repo:obsidianmd/obsidian-releases+state:open+label:"Ready for review"+label:plugin
* To gather historical data on merged themes:
  q=is:pr+repo:obsidianmd/obsidian-releases+is:merged+label:"Ready for review"+label:theme

This choice delegates the intensive work of filtering to GitHub's optimized infrastructure. The resulting API responses are smaller and more targeted, drastically reducing the number of requests and the amount of data transferred. This efficiency is what makes a lightweight, scheduled data-fetch architecture practical and cost-effective. Any alternative would necessitate a more complex and robust server infrastructure simply to manage the overhead of inefficient data collection.

All API requests must be authenticated using a Personal Access Token (PAT) to benefit from a higher rate limit.7 The search API has a separate, more restrictive rate limit (30 requests per minute for authenticated users), but a scheduled data-fetch job will operate comfortably within this constraint. The data ingestion service must also be designed to handle pagination, as API responses are typically limited to 100 items per page.8 The service will need to inspect the Link header of the response and make subsequent requests until all pages of a result set have been retrieved.

### **High-Level System Architecture: A Decoupled, Static-First Approach**

A traditional monolithic architecture, where a web server queries the GitHub API on every user request, is ill-suited for this application. Such a design would result in slow page loads, be expensive to host and scale, and would constantly risk hitting API rate limits.

A superior approach is a decoupled, two-component architecture:

1. **Data Ingestion Service (The "Worker"):** A backend script or process, completely separate from the frontend. Its sole responsibility is to run on a defined schedule (e.g., hourly), execute the optimized API search queries, process the retrieved data, and save the structured results to a simple persistence layer.
2. **Frontend Application (The "Website"):** A modern static site. This application reads the data prepared by the worker during its build process and pre-renders all pages as static HTML, CSS, and JavaScript files.

This static-first architecture offers significant advantages:

* **Performance:** Users download pre-built files directly from a Content Delivery Network (CDN), leading to near-instantaneous page loads.
* **Scalability and Cost:** Static hosting is exceptionally inexpensive (often free for public projects) and can handle enormous traffic spikes without performance degradation or additional cost.
* **Robustness:** The user-facing website is not dependent on the live status of the GitHub API. If an API outage occurs during a scheduled data fetch, the site continues to serve the last known good data, ensuring high availability.
* **Security:** The public attack surface is minimized, as there is no live database or complex server-side application logic exposed to end-users.

## **Technical Implementation Blueprint**

This section translates the architectural strategy into a concrete implementation plan, defining the data structures, detailing the logic for both the worker and the frontend, and outlining the core calculations.

### **Data Modeling and Persistence**

It is unnecessary and inefficient to store the entire, verbose pull request object returned by the GitHub API. Instead, a curated data model should be defined to store only the fields essential for the application's functionality. This transformation step, performed by the data ingestion service, creates a clean contract between the backend worker and the frontend application, simplifying development and improving performance.

The following table outlines the proposed data model for each pull request. This schema ensures the frontend deals only with clean, predictable, and relevant data, rather than the complex raw API response.1

| Column Name | Data Type | Description | Source (API Field) | Example |
| :---- | :---- | :---- | :---- | :---- |
| id | Integer | Unique identifier for the PR. | number | 12345 |
| title | String | The title of the pull request. | title | "Add new plugin: SuperFormatter" |
| url | String | Direct link to the PR on GitHub. | html\_url | "[https://github.com/](https://github.com/)..." |
| state | Enum | 'open' or 'merged'. | state, merged\_at | 'open' |
| type | Enum | 'plugin' or 'theme'. | labels array | 'plugin' |
| createdAt | ISO 8601 String | Timestamp of PR creation. | created\_at | "2023-10-27T10:00:00Z" |
| mergedAt | ISO 8601 String | Timestamp of PR merge. Null if open. | merged\_at | "2023-11-15T14:30:00Z" |
| daysToMerge | Integer | Calculated duration. Null if open. | merged\_at \- created\_at | 19 |

For the persistence layer, a simple and cost-effective strategy is recommended for the initial implementation. The worker service will write the collected data—structured as two arrays, one for open PRs and one for historical PRs—into a single JSON file (e.g., data.json). This file can be committed directly to the project's Git repository, where it can be easily accessed by the frontend during its build step. More complex solutions like a database are unnecessary for this use case.

### **The Data Ingestion Service (The "Worker")**

The most elegant and efficient environment for the worker is a GitHub Actions workflow. This approach is free for public repositories, co-locates the automation logic with the application code, and requires no external infrastructure. The workflow can be configured to run on a schedule, such as hourly (cron: '0 \* \* \* \*'), to ensure the data remains fresh.

The step-by-step logic for the worker script is as follows:

1. **Initialization:** The workflow begins, authenticating with the GitHub API using a Personal Access Token stored securely as a repository secret.7
2. **Fetch Open PRs:** The script constructs the precise search queries for open plugins and themes, as defined in the previous section. It then initiates the API requests, diligently handling pagination by checking the Link response header to retrieve all pages of results. Each raw PR object returned by the API is transformed into the curated data model.
3. **Fetch Historical PRs:** A similar process is executed to retrieve merged PRs. To keep the historical dataset manageable and relevant, the query can be constrained to PRs merged within a specific timeframe, such as the last 12-18 months (e.g., by adding a merged:\> qualifier to the search query).
4. **Data Persistence:** The collected and transformed data is aggregated into a single JSON object (e.g., { "open": \[...\], "historical": \[...\] }) and written to the data.json file. The GitHub Actions workflow then commits and pushes this updated file back to the repository. This push action can, in turn, trigger the automated build and deployment of the frontend application.

### **Frontend Application and Visualization Logic**

The frontend application will be built using a static site generator. During its build process, it will read the local data.json file, ensuring that all rendering and calculations are based on this static, pre-processed data.

The user interface can be broken down into several key components:

* **Queue Size Cards:** These are simple display elements showing the current count of open plugins, open themes, and the total queue size. The values are derived directly from the length of the filtered open data array.
* **Open PRs List:** A table that displays the PRs from the open array, sorted by their creation date (createdAt) in ascending order. This provides a clear, real-time view of the current review queue.
* **Historical Timeline Chart:** A graphical visualization, such as a scatter plot or bar chart, that plots the historical data. The X-axis will represent time, while the Y-axis will represent the daysToMerge. This chart serves to visually validate the chronological review assumption and reveal trends in review times. Plugins and themes should be distinctly color-coded for easy comparison.

The wait-time estimation algorithm is the core of the application's predictive functionality. A robust implementation would proceed as follows:

1. **Filter Data:** Isolate the relevant historical data for the category being estimated (e.g., plugins merged in the last 90 days).
2. **Calculate Throughput:** Determine the average number of PRs of a given type that are merged per week. This can be calculated as $PRs/week \= (\\text{number of PRs merged in last 90 days}) / (90 / 7)$.
3. **Determine Queue Position:** The position for a new submission is simply the current number of open PRs of the same type.
4. **Estimate Wait Time:** The basic estimate is calculated as $\\text{estimatedWeeks} \= \\text{queuePosition} / \\text{throughput}$.

A simple average can be susceptible to outliers. A more refined approach is to use a moving average of the daysToMerge for the last 20-30 merged PRs. This method provides a more immediate reflection of the review team's current capacity and pace.

Furthermore, presenting the estimate as a single number (e.g., "8.2 weeks") creates a false sense of precision. The review process has inherent variability. A more statistically sound and honest approach is to present the estimate as a range or a confidence interval. By calculating the standard deviation of the historical daysToMerge data, the system can provide a more realistic forecast, such as "Estimated wait is 7-10 weeks." This manages user expectations more effectively and acknowledges the natural fluctuations in the human-driven review process, elevating the tool's credibility.

## **Recommended Technology Stack**

The following technology stack is recommended to align with the static-first architecture, prioritizing developer experience, performance, and cost-effectiveness. Each component is chosen to complement the others and serve the project's strategic goals.

| Category | Recommendation | Justification |
| :---- | :---- | :---- |
| **Frontend Framework** | **Next.js (with React)** | Provides best-in-class support for Static Site Generation (SSG), which is the cornerstone of the proposed architecture. It has a vast ecosystem, excellent documentation, and integrates seamlessly with Vercel for hosting. |
| **Data Ingestion** | **Node.js Script (run via GitHub Actions)** | A simple, lightweight runtime for the worker script. Using JavaScript/TypeScript allows for language consistency across the entire project stack, from backend to frontend. |
| **GitHub API Client** | **Octokit.js** | The official GitHub SDK for JavaScript. It greatly simplifies API interactions by providing built-in methods for authentication and pagination, and offers TypeScript types for API responses, which helps prevent common errors.7 |
| **Data Visualization** | **Chart.js** | An easy-to-use, well-documented charting library capable of creating the required timeline visualizations with minimal code. It offers a perfect balance of power and simplicity for this project's needs. |
| **Styling** | **Tailwind CSS** | A utility-first CSS framework that enables rapid development of clean, data-focused user interfaces without the need for writing extensive custom CSS. |
| **Hosting/Deployment** | **Vercel** | A platform built by the creators of Next.js, offering native support and optimization. It provides a generous free tier, fully automated deployments via Git integration, and a global CDN for maximum performance. |

## **Phased Development and MVP Roadmap**

A phased approach to development is recommended to allow for a rapid initial launch while providing a clear path for future enhancements.

### **Defining the Minimum Viable Product (MVP): "The Queue Snapshot"**

The goal of the MVP is to launch quickly with the most critical information: the current state of the review queue.

* **Features:**
  1. A data ingestion script that fetches only *open* PRs with the "Ready for review" label, categorized by type.
  2. A simple user interface displaying the total counts for "Plugins in Queue" and "Themes in Queue."
  3. A basic, unstyled list of the open PRs, showing their title, ID, and creation date, sorted from oldest to newest.
* **Exclusions:** The MVP will consciously omit historical data, timeline charts, and the wait-time estimation feature. This strategic exclusion dramatically simplifies the initial build and validation process.

### **Post-MVP Enhancement Roadmap**

* **Phase 2: "The Historical Context"**
  * **Features:**
    1. Expand the data ingestion script to fetch the last 12 months of *merged* PRs.
    2. Implement the historical timeline chart, visualizing the daysToMerge for both plugins and themes. This phase provides the visual evidence for the chronological assumption and adds valuable trend analysis capabilities.
* **Phase 3: "The Predictive Engine"**
  * **Features:**
    1. Implement the wait-time estimation algorithm based on historical throughput and current queue size.
    2. Display the calculated estimates prominently on the dashboard for both plugins and themes.
* **Phase 4: "Maturity and Refinement"**
  * **Features:**
    1. Implement the statistical confidence interval for the wait-time estimate (e.g., "7-10 weeks").
    2. Add the "model confidence" metric to warn users of volatility in the review process.
    3. Enhance the user interface with advanced filtering and sorting options for the PR lists.

## **Conclusion**

The development of a dedicated analytics platform for the Obsidian plugin and theme review queue is a highly feasible and valuable project. The analysis confirms that the necessary data is fully accessible via the GitHub API and that a robust, performant, and cost-effective solution can be built using modern web development practices.

The key strategic recommendations are:

1. **Adopt a Static-First Architecture:** A decoupled system with a scheduled data ingestion service and a statically generated frontend will provide superior performance, scalability, and robustness at virtually no cost.
2. **Utilize the search/issues API Endpoint:** This is the most critical technical decision. Its powerful server-side filtering capabilities are the foundation for an efficient and reliable data collection process, making the entire project viable.
3. **Automate with GitHub Actions:** Leveraging GitHub Actions for the data ingestion worker eliminates the need for external server infrastructure, simplifying deployment and maintenance.

By following the proposed architectural blueprint and phased development roadmap, it is possible to deliver a tool that provides significant transparency and utility to the vibrant Obsidian developer community, helping them better plan and manage their contributions.

#### **Works cited**

1. REST API endpoints for pull requests \- GitHub Docs, accessed October 20, 2025, [https://docs.github.com/en/rest/pulls/pulls](https://docs.github.com/en/rest/pulls/pulls)
2. Pull Requests and their Associated Objects \- github3.py, accessed October 20, 2025, [https://github3.readthedocs.io/en/develop/api-reference/pulls.html](https://github3.readthedocs.io/en/develop/api-reference/pulls.html)
3. REST API endpoints for labels \- GitHub Docs, accessed October 20, 2025, [https://docs.github.com/en/rest/issues/labels](https://docs.github.com/en/rest/issues/labels)
4. REST API endpoints for issues \- GitHub Docs, accessed October 20, 2025, [https://docs.github.com/en/rest/issues/issues](https://docs.github.com/en/rest/issues/issues)
5. Github API: Is it possible to list Pull Requests by label? \- Stack Overflow, accessed October 20, 2025, [https://stackoverflow.com/questions/36974157/github-api-is-it-possible-to-list-pull-requests-by-label](https://stackoverflow.com/questions/36974157/github-api-is-it-possible-to-list-pull-requests-by-label)
6. Filtering and searching issues and pull requests \- GitHub Docs, accessed October 20, 2025, [https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/filtering-and-searching-issues-and-pull-requests](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/filtering-and-searching-issues-and-pull-requests)
7. GitHub pull request API \- Graphite, accessed October 20, 2025, [https://graphite.dev/guides/github-pull-request-api](https://graphite.dev/guides/github-pull-request-api)
8. github api get number of pull requests \- Stack Overflow, accessed October 20, 2025, [https://stackoverflow.com/questions/13094712/github-api-get-number-of-pull-requests](https://stackoverflow.com/questions/13094712/github-api-get-number-of-pull-requests)
9. REST API endpoints for pull request reviews \- GitHub Docs, accessed October 20, 2025, [https://docs.github.com/en/rest/pulls/reviews](https://docs.github.com/en/rest/pulls/reviews)

---

A few notes:
- I do not want to use Next.js or Vercel
- You are already in the project root, I initialized a react/Vite Cloudflare template for you
- Cloudflare switched from TOML to JSONC for configuration
- Cloudflare Pages are deprecated, use only Workers for everything
- Implement this on Cloudflare using their Worerks and their cron triggers -> https://developers.cloudflare.com/workers/configuration/cron-triggers/ to retrieve the data from the GitHub API on a regular basis instead of GitHub actions
- The data should get stored in Cloudflare D1 -> https://developers.cloudflare.com/d1/get-started/
- Feel free to use modern libraries state helpers like TanStack Query -> https://tanstack.com/query/latest/docs/framework/react/overview
- And Zustand -> https://zustand.docs.pmnd.rs/getting-started/introduction

---

Changelog:

Please keep a "Keep a Changelog" style `CHANGELOG.md` file (details see here -> https://keepachangelog.com/en/1.1.0/)
Add relevant, major steps to this changelog, but in typical extreme terse form, one item per line starting with a dash, no more than a few words, assume context is obvious for every step, no explanations.

---

Implementation file:

Please update the `IMPLEMENTATION_PLAN.md` file as you continue workin on this project. Mark completed steps. Update the plan as needed. Use markdown checkboxes to indicate progress.
