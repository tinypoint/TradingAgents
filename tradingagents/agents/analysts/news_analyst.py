from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.tools import tool
from datetime import datetime
import time
import json
from tradingagents.agents.utils.agent_utils import get_news as base_get_news, get_global_news as base_get_global_news
from tradingagents.dataflows.config import get_config


def create_news_analyst(llm):
    def news_analyst_node(state):
        current_date = state["trade_date"]
        ticker = state["company_of_interest"]
        selected_start_date = state.get("start_date", "")
        selected_end_date = state.get("end_date", current_date)

        @tool
        def get_news(
            ticker: str,
            start_date: str,
            end_date: str,
        ) -> str:
            """Retrieve company news for selected CLI range and ticker."""
            return base_get_news.invoke(
                {
                    "ticker": state["company_of_interest"],
                    "start_date": selected_start_date or start_date,
                    "end_date": selected_end_date or end_date,
                }
            )

        @tool
        def get_global_news(
            curr_date: str,
            look_back_days: int = 7,
            limit: int = 5,
        ) -> str:
            """Retrieve global news anchored to selected CLI range."""
            try:
                sdt = datetime.strptime(selected_start_date, "%Y-%m-%d")
                edt = datetime.strptime(selected_end_date, "%Y-%m-%d")
                enforced_lookback = max(1, (edt - sdt).days + 1)
            except Exception:
                enforced_lookback = look_back_days
            return base_get_global_news.invoke(
                {
                    "curr_date": selected_end_date or curr_date,
                    "look_back_days": enforced_lookback,
                    "limit": limit,
                }
            )

        tools = [
            get_news,
            get_global_news,
        ]

        system_message = (
            "You are a news researcher tasked with analyzing recent news and trends within the selected date range. Please write a comprehensive report of the current state of the world that is relevant for trading and macroeconomics. Use the available tools: get_news(ticker, start_date, end_date) for company-specific or targeted news searches, and get_global_news(curr_date, look_back_days, limit) for broader macroeconomic news. Do not simply state the trends are mixed, provide detailed and finegrained analysis and insights that may help traders make decisions."
            + """ Make sure to append a Markdown table at the end of the report to organize key points in the report, organized and easy to read."""
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
                    "For your reference, the current date is {current_date}. We are looking at the company {ticker}",
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
            "news_report": report,
        }

    return news_analyst_node
