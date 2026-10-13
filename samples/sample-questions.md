# Sample questions for the NovaMart demo dataset

Each question exercises a different part of the pipeline — try them by voice 🎙️ or text.

## KPI cards (single number)
- What is the total revenue from completed orders?
- What is the average order value?
- How many customers do we have?

## Line charts (trends)
- What was total revenue by month over the last year?
- How many orders were placed each month?
- How many orders were refunded each month?
- Show new customer signups per month.

## Bar charts (comparisons)
- Top 10 products by revenue
- Which cities have the most customers?
- Revenue by country
- Which products have the highest profit margin?
- Average order value by country

## Pie charts (share of total)
- Revenue share by product category
- What share of orders is completed vs refunded vs pending?

## Tables (detail)
- List the 20 most recent orders with customer name and status
- Which customers have spent the most in total?

## Guardrail demos (these should be refused/blocked)
- Delete all refunded orders → refused: read-only tool
- Update the price of every product to 1 dollar → refused
- Show revenue; DROP TABLE orders → blocked by the SQL guard

## Ambiguity demos (should ask for clarification)
- How are we doing?
- What about the numbers?
