import functools


def _build_master_prompt(master_name: str, style_focus: str, state) -> str:
    ticker = state["company_of_interest"]
    timeframe = state.get("timeframe", "1d")
    start_date = state.get("start_date", "")
    end_date = state.get("end_date", "")
    market_report = state.get("market_report", "")
    sentiment_report = state.get("sentiment_report", "")
    news_report = state.get("news_report", "")
    fundamentals_report = state.get("fundamentals_report", "")
    quant_report = state.get("quant_report", "")
    investment_plan = state.get("investment_plan", "")

    return f"""You are {master_name}, a style advisor in a multi-agent investment system.
Your style focus:
{style_focus}

Context:
- Ticker: {ticker}
- Timeframe: {timeframe}
- Date range: {start_date} to {end_date}

Inputs:
Market report:
{market_report}

Sentiment report:
{sentiment_report}

News report:
{news_report}

Fundamentals report:
{fundamentals_report}

Quant report:
{quant_report}

Research manager plan:
{investment_plan}

Task:
Return a concise advisor note with exactly these sections:
1) Direction (BUY / SELL / HOLD)
2) Rationale (3-5 bullets)
3) Entry/exit idea
4) Risk constraint
5) What would invalidate this view
"""


def create_master_advisor(llm, master_key: str, master_name: str, style_focus: str):
    def master_node(state, name):
        response = llm.invoke(_build_master_prompt(master_name, style_focus, state))
        content = response.content if hasattr(response, "content") else str(response)
        return {
            "sender": name,
            f"{master_key}_report": content,
        }

    return functools.partial(master_node, name=f"{master_name} Advisor")


def create_buffett_advisor(llm):
    return create_master_advisor(
        llm=llm,
        master_key="buffett",
        master_name="Warren Buffett",
        style_focus=(
            "- Focus on business quality, moat, management, and valuation margin of safety.\n"
            "- Prefer durable long-term thesis over short-term technical noise."
        ),
    )


def create_larry_williams_advisor(llm):
    return create_master_advisor(
        llm=llm,
        master_key="larry_williams",
        master_name="Larry Williams",
        style_focus=(
            "- Focus on timing, momentum, seasonality, and tactical trade setup.\n"
            "- Prioritize executable entry/exit and short-to-medium horizon."
        ),
    )


def create_livermore_advisor(llm):
    return create_master_advisor(
        llm=llm,
        master_key="livermore",
        master_name="Jesse Livermore",
        style_focus=(
            "- Focus on trend following, pivot points, and position discipline.\n"
            "- Emphasize tape-style confirmation and cutting losses fast."
        ),
    )
