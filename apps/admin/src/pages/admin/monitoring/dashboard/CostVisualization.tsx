import React, { useEffect, useState, useMemo } from 'react';
import ReactApexChart from 'react-apexcharts';
import { ApexOptions } from 'apexcharts';
import { useApi } from '@/hooks/use-api';
import { useConfig } from '@/contexts/config';
import { createMonitoringClient, type ExtractionJobSummary } from '@/api/monitoring';

interface CostVisualizationProps {
    jobs: ExtractionJobSummary[];
    loading?: boolean;
}

export const CostVisualization: React.FC<CostVisualizationProps> = ({ jobs, loading }) => {
    const { config } = useConfig();
    const isDark = config.theme === 'dark';

    // Calculate metrics
    const metrics = useMemo(() => {
        const totalCost = jobs.reduce((sum, job) => sum + (job.total_cost_usd || 0), 0);
        const avgCost = jobs.length > 0 ? totalCost / jobs.length : 0;
        const maxCost = Math.max(...jobs.map(j => j.total_cost_usd || 0), 0);

        // Group by date for time series
        const costByDate = new Map<string, number>();
        jobs.forEach(job => {
            // Skip jobs without valid dates
            if (!job.started_at) return;

            const dateObj = new Date(job.started_at);
            if (isNaN(dateObj.getTime())) return; // Skip invalid dates

            const date = dateObj.toISOString().split('T')[0];
            costByDate.set(date, (costByDate.get(date) || 0) + (job.total_cost_usd || 0));
        });

        // Sort dates
        const sortedDates = Array.from(costByDate.keys()).sort();
        const timeSeriesData = sortedDates.map(date => ({
            date,
            cost: costByDate.get(date) || 0
        }));

        // Cost by status
        const costByStatus = {
            completed: 0,
            failed: 0,
            in_progress: 0,
            pending: 0
        };
        jobs.forEach(job => {
            if (job.status in costByStatus) {
                costByStatus[job.status] += job.total_cost_usd || 0;
            }
        });

        // Top 10 most expensive jobs
        const topExpensiveJobs = [...jobs]
            .sort((a, b) => (b.total_cost_usd || 0) - (a.total_cost_usd || 0))
            .slice(0, 10);

        return {
            totalCost,
            avgCost,
            maxCost,
            timeSeriesData,
            costByStatus,
            topExpensiveJobs
        };
    }, [jobs]);

    // Time series chart options
    const timeSeriesOptions: ApexOptions = {
        chart: {
            type: 'area',
            height: 300,
            toolbar: {
                show: true,
                tools: {
                    download: true,
                    selection: false,
                    zoom: false,
                    zoomin: false,
                    zoomout: false,
                    pan: false,
                    reset: false
                }
            },
            background: 'transparent',
            animations: {
                enabled: true,
                speed: 800
            }
        },
        dataLabels: {
            enabled: false
        },
        stroke: {
            curve: 'smooth',
            width: 2
        },
        fill: {
            type: 'gradient',
            gradient: {
                shadeIntensity: 1,
                opacityFrom: 0.7,
                opacityTo: 0.3,
                stops: [0, 90, 100]
            }
        },
        xaxis: {
            categories: metrics.timeSeriesData.map(d => d.date),
            labels: {
                style: {
                    colors: isDark ? '#a6adbb' : '#6b7280'
                },
                formatter: (value: string) => {
                    const date = new Date(value);
                    if (isNaN(date.getTime())) return value; // Return raw value if invalid
                    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                }
            }
        },
        yaxis: {
            labels: {
                style: {
                    colors: isDark ? '#a6adbb' : '#6b7280'
                },
                formatter: (value: number) => `$${value.toFixed(4)}`
            }
        },
        tooltip: {
            theme: isDark ? 'dark' : 'light',
            x: {
                formatter: (value: number, opts: any) => {
                    const dateStr = opts.w.config.xaxis.categories[opts.dataPointIndex];
                    if (!dateStr) return 'Unknown date';
                    const date = new Date(dateStr);
                    if (isNaN(date.getTime())) return dateStr;
                    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
                }
            },
            y: {
                formatter: (value: number) => `$${value.toFixed(4)}`
            }
        },
        grid: {
            borderColor: isDark ? '#374151' : '#e5e7eb',
            strokeDashArray: 4
        },
        colors: ['#3b82f6']
    };

    const timeSeriesSeries = [
        {
            name: 'Daily Cost',
            data: metrics.timeSeriesData.map(d => d.cost)
        }
    ];

    // Status breakdown pie chart options
    const statusChartOptions: ApexOptions = {
        chart: {
            type: 'donut',
            height: 300,
            background: 'transparent'
        },
        labels: ['Completed', 'Failed', 'In Progress', 'Pending'],
        colors: ['#10b981', '#ef4444', '#3b82f6', '#f59e0b'],
        legend: {
            position: 'bottom',
            labels: {
                colors: isDark ? '#a6adbb' : '#6b7280'
            }
        },
        dataLabels: {
            enabled: true,
            formatter: (val: number) => `$${(val as any).toFixed(2)}`
        },
        tooltip: {
            theme: isDark ? 'dark' : 'light',
            y: {
                formatter: (value: number) => `$${value.toFixed(4)}`
            }
        },
        plotOptions: {
            pie: {
                donut: {
                    size: '65%',
                    labels: {
                        show: true,
                        name: {
                            show: true,
                            color: isDark ? '#a6adbb' : '#6b7280'
                        },
                        value: {
                            show: true,
                            color: isDark ? '#a6adbb' : '#6b7280',
                            formatter: (val: string) => `$${parseFloat(val).toFixed(4)}`
                        },
                        total: {
                            show: true,
                            label: 'Total Cost',
                            color: isDark ? '#a6adbb' : '#6b7280',
                            formatter: () => `$${metrics.totalCost.toFixed(4)}`
                        }
                    }
                }
            }
        }
    };

    const statusChartSeries = [
        metrics.costByStatus.completed,
        metrics.costByStatus.failed,
        metrics.costByStatus.in_progress,
        metrics.costByStatus.pending
    ];

    // Top jobs bar chart options
    const topJobsOptions: ApexOptions = {
        chart: {
            type: 'bar',
            height: 300,
            toolbar: {
                show: false
            },
            background: 'transparent'
        },
        plotOptions: {
            bar: {
                horizontal: true,
                borderRadius: 4,
                dataLabels: {
                    position: 'top'
                }
            }
        },
        dataLabels: {
            enabled: true,
            formatter: (val: number) => `$${val.toFixed(4)}`,
            offsetX: 0,
            style: {
                fontSize: '12px',
                colors: [isDark ? '#1f2937' : '#ffffff']
            }
        },
        xaxis: {
            categories: metrics.topExpensiveJobs.map(job => job.id.slice(0, 8)),
            labels: {
                style: {
                    colors: isDark ? '#a6adbb' : '#6b7280'
                },
                formatter: (value: string) => `$${parseFloat(value).toFixed(2)}`
            }
        },
        yaxis: {
            labels: {
                style: {
                    colors: isDark ? '#a6adbb' : '#6b7280'
                }
            }
        },
        tooltip: {
            theme: isDark ? 'dark' : 'light',
            y: {
                formatter: (value: number) => `$${value.toFixed(4)}`
            }
        },
        grid: {
            borderColor: isDark ? '#374151' : '#e5e7eb'
        },
        colors: ['#8b5cf6']
    };

    const topJobsSeries = [
        {
            name: 'Cost',
            data: metrics.topExpensiveJobs.map(job => job.total_cost_usd || 0)
        }
    ];

    if (loading) {
        return (
            <div className="flex justify-center items-center h-96">
                <span className="text-primary loading loading-spinner loading-lg"></span>
            </div>
        );
    }

    if (jobs.length === 0) {
        return (
            <div className="py-12 text-base-content/70 text-center">
                <p>No data available for cost visualization</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Summary Stats */}
            <div className="gap-4 grid grid-cols-3">
                <div className="bg-base-200 rounded-lg stat">
                    <div className="stat-title">Total Cost</div>
                    <div className="text-primary text-2xl stat-value">
                        ${metrics.totalCost.toFixed(4)}
                    </div>
                    <div className="stat-desc">{jobs.length} jobs</div>
                </div>
                <div className="bg-base-200 rounded-lg stat">
                    <div className="stat-title">Average Cost</div>
                    <div className="text-secondary text-2xl stat-value">
                        ${metrics.avgCost.toFixed(4)}
                    </div>
                    <div className="stat-desc">per job</div>
                </div>
                <div className="bg-base-200 rounded-lg stat">
                    <div className="stat-title">Highest Cost</div>
                    <div className="text-accent text-2xl stat-value">
                        ${metrics.maxCost.toFixed(4)}
                    </div>
                    <div className="stat-desc">single job</div>
                </div>
            </div>

            {/* Charts Grid */}
            <div className="gap-6 grid grid-cols-1 lg:grid-cols-2">
                {/* Time Series Chart */}
                <div className="bg-base-200 card">
                    <div className="card-body">
                        <h3 className="mb-4 text-lg card-title">Cost Over Time</h3>
                        <ReactApexChart
                            options={timeSeriesOptions}
                            series={timeSeriesSeries}
                            type="area"
                            height={300}
                        />
                    </div>
                </div>

                {/* Status Breakdown Pie Chart */}
                <div className="bg-base-200 card">
                    <div className="card-body">
                        <h3 className="mb-4 text-lg card-title">Cost by Status</h3>
                        <ReactApexChart
                            options={statusChartOptions}
                            series={statusChartSeries}
                            type="donut"
                            height={300}
                        />
                    </div>
                </div>
            </div>

            {/* Top Expensive Jobs */}
            {metrics.topExpensiveJobs.length > 0 && (
                <div className="bg-base-200 card">
                    <div className="card-body">
                        <h3 className="mb-4 text-lg card-title">Top 10 Most Expensive Jobs</h3>
                        <ReactApexChart
                            options={topJobsOptions}
                            series={topJobsSeries}
                            type="bar"
                            height={300}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
