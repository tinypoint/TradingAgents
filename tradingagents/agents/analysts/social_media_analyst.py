from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.tools import tool
from datetime import datetime, timedelta
import time
import json
from tradingagents.agents.utils.agent_utils import get_news as base_get_news
from tradingagents.dataflows.config import get_config


def create_social_media_analyst(llm):
    def social_media_analyst_node(state):
        current_date = state["trade_date"]
        ticker = state["company_of_interest"]
        company_name = state["company_of_interest"]
        selected_start_date = state.get("start_date", "")
        selected_end_date = state.get("end_date", current_date)

        def _as_valid_date(value: str, fallback: str) -> str:
            candidate = value.strip() if isinstance(value, str) else str(value).strip()
            try:
                datetime.strptime(candidate, "%Y-%m-%d")
                return candidate
            except Exception:
                return fallback

        enforced_end = _as_valid_date(selected_end_date, current_date)
        try:
            default_start = (
                datetime.strptime(enforced_end, "%Y-%m-%d") - timedelta(days=365)
            ).strftime("%Y-%m-%d")
        except Exception:
            default_start = enforced_end
        enforced_start = _as_valid_date(selected_start_date, default_start)

        @tool
        def get_news(
            ticker: str,
            start_date: str,
            end_date: str,
        ) -> str:
            """Retrieve company news for the selected CLI date range and ticker.

            Model-provided ticker/start/end are ignored for consistency.
            """
            return base_get_news.invoke(
                {
                    "ticker": state["company_of_interest"],
                    "start_date": enforced_start,
                    "end_date": enforced_end,
                }
            )

        tools = [
            get_news,
        ]

        system_message = (
            "You are a social media and company specific news researcher/analyst tasked with analyzing social media posts, recent company news, and public sentiment for a specific company within the selected date range. You will be given a company's name your objective is to write a comprehensive long report detailing your analysis, insights, and implications for traders and investors on this company's current state after looking at social media and what people are saying about that company, analyzing sentiment data of what people feel each day about the company, and looking at recent company news. Use the get_news(ticker, start_date, end_date) tool to search for company-specific news and social media discussions. Try to look at all sources possible from social media to sentiment to news. Do not simply state the trends are mixed, provide detailed and finegrained analysis and insights that may help traders make decisions."
            + """ Make sure to append a Markdown table at the end of the report to organize key points in the report, organized and easy to read.""",
        )

        prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    "You are a helpful AI assistant, collaborating with other assistants."
                    " Use the provided tools to progress towards answering the question."
                    " If you are unable to fully answer, that's OK; another assistant with different tools"
                    " will help where you left off. Execute what you can to make progress."
                    " If you or any other assistant has the FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL** or deliverable,"
                    " prefix your response with FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL** so the team knows to stop."
                    " You have access to the following tools: {tool_names}.\n{system_message}"
                    "For your reference, the current date is {current_date}. The current company we want to analyze is {ticker}",
                ),
                MessagesPlaceholder(variable_name="messages"),
            ]
        )

        prompt = prompt.partial(system_message=system_message)
        prompt = prompt.partial(tool_names=", ".join([tool.name for tool in tools]))
        prompt = prompt.partial(current_date=current_date)
        prompt = prompt.partial(ticker=ticker)

        chain = prompt | llm.bind_tools(tools)

        result = chain.invoke(state["messages"])

        report = ""

        if len(result.tool_calls) == 0:
            report = result.content

        return {
            "messages": [result],
            "sentiment_report": report,
        }

    return social_media_analyst_node
