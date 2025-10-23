# Cost Visualization - Quick Test Guide

## How to Test

1. **Open Dashboard**:
   ```
   http://localhost:5175/admin/monitoring/dashboard
   ```

2. **Switch to Cost Analytics**:
   - Click the "Cost Analytics" tab in the dashboard header
   - You should see 3 charts appear:
     - Time series area chart (cost over time)
     - Donut chart (cost by status)
     - Horizontal bar chart (top 10 expensive jobs)

3. **Check Summary Cards**:
   - Look at the 3 metric cards at the top:
     - Total Cost: Sum of all job costs
     - Average Cost: Total cost / number of jobs
     - Maximum Cost: Highest individual job cost

4. **Test Interactions**:
   - Hover over chart elements to see tooltips
   - Check that all costs display as $X.XXXX format
   - Verify colors match job statuses (green=completed, red=failed, etc.)

5. **Test Theme Switching**:
   - Click the theme toggle (sun/moon icon)
   - Verify all charts adapt to new theme
   - Check that text remains readable in both modes

6. **Switch Back to Job List**:
   - Click "Job List" tab
   - Verify filters and table reappear correctly

## What to Look For

✅ **Good Signs**:
- Charts render smoothly without flickering
- All costs formatted consistently
- Theme colors apply correctly
- Tooltips show detailed information
- Summary metrics calculate correctly
- Tab switching is instant

❌ **Issues to Report**:
- Charts fail to render (check browser console)
- Incorrect cost calculations
- Theme colors don't apply
- Tooltips missing or incomplete
- Performance lag when switching tabs

## Test with Different Data

- **No jobs**: Should show empty state
- **Few jobs (< 10)**: All jobs should appear in bar chart
- **Many jobs (> 10)**: Only top 10 should appear in bar chart
- **All jobs same status**: Donut chart should show single segment
- **Jobs spanning multiple days**: Time series should show multiple points

## Browser Console

Open browser console (F12) and check for:
- No errors or warnings
- No 404s for chart libraries
- Smooth render performance

## Expected Performance

- Initial render: < 500ms
- Tab switching: < 100ms (instant)
- Theme switching: < 200ms
- Chart interactions: < 50ms (instant)

## Known Limitations

- Charts optimized for up to 1000 jobs
- Time series aggregates by day (no hourly breakdown)
- Bar chart shows max 10 jobs (by design)
- No drill-down to job detail from charts yet

## Next Features to Test

Once this works, we can add:
1. Date range filtering
2. Export charts as PNG
3. Real-time updates (polling)
4. Click charts to filter job list
5. Cost trend indicators
