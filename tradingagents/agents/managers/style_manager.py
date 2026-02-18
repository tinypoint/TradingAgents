def create_style_manager(llm):
    def style_manager_node(state) -> dict:
        selected = state.get("selected_masters", []) or []
        reports = []
        if "buffett" in selected:
            reports.append(("Buffett", state.get("buffett_report", "")))
        if "larry_williams" in selected:
            reports.append(("Larry Williams", state.get("larry_williams_report", "")))
        if "livermore" in selected:
            reports.append(("Jesse Livermore", state.get("livermore_report", "")))

        if not reports:
            return {"style_report": ""}

        report_text = "\n\n".join([f"{name}:\n{text}" for name, text in reports if text])
        prompt = f"""You are the Style Council Manager.
Aggregate the advisor notes below into one actionable style report for the Trader.

Advisor notes:
{report_text}

Return sections:
1) Consensus direction (BUY / SELL / HOLD)
2) Conflicts among advisors
3) Execution template (entry, stop, target, sizing hint)
4) Risk guardrails
5) Final style bias in one line
"""
        response = llm.invoke(prompt)
        content = response.content if hasattr(response, "content") else str(response)
        return {"style_report": content}

    return style_manager_node
