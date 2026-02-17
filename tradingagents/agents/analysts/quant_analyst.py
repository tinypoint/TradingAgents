from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Tuple
import base64
import json

import matplotlib
import matplotlib.pyplot as plt
import mplfinance as mpf
import numpy as np
import pandas as pd
import yfinance as yf
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

matplotlib.use("Agg")


def _get_report_dir(ticker: str, trade_date: str) -> Path:
    tradingagents_root = Path(__file__).resolve().parents[3]
    report_dir = tradingagents_root / "results" / ticker / str(trade_date) / "reports"
    report_dir.mkdir(parents=True, exist_ok=True)
    return report_dir


def _fetch_ohlc_df(
    ticker: str,
    start_date: str,
    end_date: str,
    interval: str = "1d",
) -> pd.DataFrame:
    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    end_dt = datetime.strptime(end_date, "%Y-%m-%d")
    if end_dt < start_dt:
        raise ValueError("end_date must be greater than or equal to start_date.")

    # Intraday intervals on yfinance have limited lookback windows.
    intraday_intervals = {"1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h"}
    if interval in intraday_intervals:
        max_days = 60
        min_start_dt = end_dt - timedelta(days=max_days)
        if start_dt < min_start_dt:
            start_dt = min_start_dt
            start_date = start_dt.strftime("%Y-%m-%d")

    # yfinance end date is exclusive; include selected end date.
    fetch_end = (end_dt + timedelta(days=1)).strftime("%Y-%m-%d")

    df = yf.download(
        tickers=ticker,
        start=start_date,
        end=fetch_end,
        interval=interval,
        auto_adjust=True,
        progress=False,
        multi_level_index=False,
    )
    if df is None or df.empty:
        raise ValueError("No OHLC data returned from yfinance.")

    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    df = df.reset_index()
    if "Date" in df.columns:
        df = df.rename(columns={"Date": "Datetime"})
    required = ["Datetime", "Open", "High", "Low", "Close"]
    for col in required:
        if col not in df.columns:
            raise ValueError(f"Missing required column: {col}")
    return df[required].copy()


def _safe_float(x) -> float:
    try:
        if pd.isna(x):
            return 0.0
        return float(x)
    except Exception:
        return 0.0


def _df_to_kline_data(df: pd.DataFrame) -> Dict[str, list]:
    d = df.copy()
    d["Datetime"] = pd.to_datetime(d["Datetime"]).dt.strftime("%Y-%m-%d %H:%M:%S")
    return {
        "Datetime": d["Datetime"].tolist(),
        "Open": d["Open"].astype(float).tolist(),
        "High": d["High"].astype(float).tolist(),
        "Low": d["Low"].astype(float).tolist(),
        "Close": d["Close"].astype(float).tolist(),
    }


def _to_data_url(image_path: Path) -> str:
    raw = image_path.read_bytes()
    return f"data:image/png;base64,{base64.b64encode(raw).decode('utf-8')}"


def _to_candles(df: pd.DataFrame) -> pd.DataFrame:
    candles = df.copy()
    candles["Datetime"] = pd.to_datetime(candles["Datetime"])
    candles = candles.set_index("Datetime")
    return candles[["Open", "High", "Low", "Close"]]


def _get_mpf_style():
    mc = mpf.make_marketcolors(
        up="#26a69a",
        down="#ef5350",
        wick={"up": "#26a69a", "down": "#ef5350"},
        edge={"up": "#26a69a", "down": "#ef5350"},
        volume="inherit",
    )
    return mpf.make_mpf_style(base_mpf_style="charles", marketcolors=mc)


def _check_trend_line(support: bool, pivot: int, slope: float, y: pd.Series) -> float:
    intercept = -slope * pivot + y.iloc[pivot]
    line_vals = slope * np.arange(len(y)) + intercept
    diffs = line_vals - y
    if support and diffs.max() > 1e-5:
        return -1.0
    if (not support) and diffs.min() < -1e-5:
        return -1.0
    return float((diffs**2.0).sum())


def _optimize_slope(support: bool, pivot: int, init_slope: float, y: pd.Series) -> Tuple[float, float]:
    slope_unit = (float(y.max()) - float(y.min())) / max(len(y), 1)
    opt_step = 1.0
    min_step = 0.0001
    curr_step = opt_step
    best_slope = init_slope
    best_err = _check_trend_line(support, pivot, init_slope, y)
    if best_err < 0:
        return init_slope, float(y.iloc[pivot] - init_slope * pivot)

    get_derivative = True
    derivative = 0.0
    while curr_step > min_step:
        if get_derivative:
            slope_change = best_slope + slope_unit * min_step
            test_err = _check_trend_line(support, pivot, slope_change, y)
            derivative = test_err - best_err
            if test_err < 0.0:
                slope_change = best_slope - slope_unit * min_step
                test_err = _check_trend_line(support, pivot, slope_change, y)
                derivative = best_err - test_err
            if test_err < 0.0:
                break
            get_derivative = False

        if derivative > 0.0:
            test_slope = best_slope - slope_unit * curr_step
        else:
            test_slope = best_slope + slope_unit * curr_step

        test_err = _check_trend_line(support, pivot, test_slope, y)
        if test_err < 0.0 or test_err >= best_err:
            curr_step *= 0.5
        else:
            best_err = test_err
            best_slope = test_slope
            get_derivative = True

    return best_slope, -best_slope * pivot + float(y.iloc[pivot])


def _fit_trendlines_single(data: pd.Series) -> Tuple[Tuple[float, float], Tuple[float, float]]:
    x = np.arange(len(data))
    slope, intercept = np.polyfit(x, data.to_numpy(), 1)
    line_points = slope * x + intercept
    upper_pivot = int((data.to_numpy() - line_points).argmax())
    lower_pivot = int((data.to_numpy() - line_points).argmin())
    support_coefs = _optimize_slope(True, lower_pivot, slope, data)
    resist_coefs = _optimize_slope(False, upper_pivot, slope, data)
    return support_coefs, resist_coefs


def _fit_trendlines_high_low(high: pd.Series, low: pd.Series, close: pd.Series) -> Tuple[Tuple[float, float], Tuple[float, float]]:
    x = np.arange(len(close))
    slope, intercept = np.polyfit(x, close.to_numpy(), 1)
    line_points = slope * x + intercept
    upper_pivot = int((high.to_numpy() - line_points).argmax())
    lower_pivot = int((low.to_numpy() - line_points).argmin())
    support_coefs = _optimize_slope(True, lower_pivot, slope, low)
    resist_coefs = _optimize_slope(False, upper_pivot, slope, high)
    return support_coefs, resist_coefs


def _get_line_points(candles: pd.DataFrame, line_points: np.ndarray):
    idx = candles.index
    line_i = len(candles) - len(line_points)
    points = []
    for i in range(line_i, len(candles)):
        points.append((idx[i], float(line_points[i - line_i])))
    return points


def _split_line_into_segments(line_points):
    return [[line_points[i], line_points[i + 1]] for i in range(len(line_points) - 1)]


def _compute_indicators(df: pd.DataFrame) -> Dict[str, float]:
    close = df["Close"].astype(float)
    high = df["High"].astype(float)
    low = df["Low"].astype(float)

    delta = close.diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = (-delta.clip(upper=0)).rolling(14).mean()
    rs = gain / loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))

    ema_fast = close.ewm(span=12, adjust=False).mean()
    ema_slow = close.ewm(span=26, adjust=False).mean()
    macd = ema_fast - ema_slow
    signal = macd.ewm(span=9, adjust=False).mean()
    hist = macd - signal

    roc = (close / close.shift(10) - 1.0) * 100.0

    low_n = low.rolling(14).min()
    high_n = high.rolling(14).max()
    stoch_k = (close - low_n) / (high_n - low_n).replace(0, np.nan) * 100.0
    stoch_d = stoch_k.rolling(3).mean()
    willr = (high_n - close) / (high_n - low_n).replace(0, np.nan) * -100.0

    return {
        "rsi": _safe_float(rsi.iloc[-1]),
        "macd": _safe_float(macd.iloc[-1]),
        "signal": _safe_float(signal.iloc[-1]),
        "hist": _safe_float(hist.iloc[-1]),
        "roc": _safe_float(roc.iloc[-1]),
        "stoch_k": _safe_float(stoch_k.iloc[-1]),
        "stoch_d": _safe_float(stoch_d.iloc[-1]),
        "willr": _safe_float(willr.iloc[-1]),
    }


def _draw_pattern_image(df: pd.DataFrame, output_path: Path) -> None:
    candles = _to_candles(df)
    fig, axlist = mpf.plot(
        candles,
        type="candle",
        style=_get_mpf_style(),
        figsize=(12, 6),
        returnfig=True,
        block=False,
    )
    axlist[0].set_ylabel("Price", fontweight="normal")
    axlist[0].set_xlabel("Datetime", fontweight="normal")
    fig.savefig(output_path, dpi=300, bbox_inches="tight", pad_inches=0.1)
    plt.close(fig)


def _draw_trend_image(df: pd.DataFrame, output_path: Path) -> float:
    candles = _to_candles(df)
    support_coefs_c, resist_coefs_c = _fit_trendlines_single(candles["Close"])
    support_coefs, resist_coefs = _fit_trendlines_high_low(
        candles["High"], candles["Low"], candles["Close"]
    )

    x = np.arange(len(candles))
    support_line_c = support_coefs_c[0] * x + support_coefs_c[1]
    resist_line_c = resist_coefs_c[0] * x + resist_coefs_c[1]
    support_line = support_coefs[0] * x + support_coefs[1]
    resist_line = resist_coefs[0] * x + resist_coefs[1]

    s_seq = _get_line_points(candles, support_line)
    r_seq = _get_line_points(candles, resist_line)
    s_seq2 = _get_line_points(candles, support_line_c)
    r_seq2 = _get_line_points(candles, resist_line_c)

    s_segments = _split_line_into_segments(s_seq)
    r_segments = _split_line_into_segments(r_seq)
    s2_segments = _split_line_into_segments(s_seq2)
    r2_segments = _split_line_into_segments(r_seq2)

    all_segments = s_segments + r_segments + s2_segments + r2_segments
    colors = (
        ["white"] * len(s_segments)
        + ["white"] * len(r_segments)
        + ["blue"] * len(s2_segments)
        + ["red"] * len(r2_segments)
    )
    apds = [
        mpf.make_addplot(support_line_c, color="blue", width=1),
        mpf.make_addplot(resist_line_c, color="red", width=1),
    ]
    fig, axlist = mpf.plot(
        candles,
        type="candle",
        style=_get_mpf_style(),
        addplot=apds,
        alines=dict(alines=all_segments, colors=colors, linewidths=1),
        returnfig=True,
        figsize=(12, 6),
        block=False,
    )
    axlist[0].set_ylabel("Price", fontweight="normal")
    axlist[0].set_xlabel("Datetime", fontweight="normal")
    axlist[0].legend(["Close Support", "Close Resistance"], loc="upper left")
    fig.savefig(output_path, dpi=300, bbox_inches="tight", pad_inches=0.1)
    plt.close(fig)
    return _safe_float(support_coefs_c[0])


def _indicator_values_json(ind: Dict[str, float]) -> str:
    return json.dumps(
        {
            "rsi": ind["rsi"],
            "macd": ind["macd"],
            "signal": ind["signal"],
            "hist": ind["hist"],
            "roc": ind["roc"],
            "stoch_k": ind["stoch_k"],
            "stoch_d": ind["stoch_d"],
            "willr": ind["willr"],
        },
        ensure_ascii=False,
        indent=2,
    )


def _build_pattern_prompt_text() -> str:
    return """
        Please refer to the following classic candlestick patterns:

        1. Inverse Head and Shoulders: Three lows with the middle one being the lowest, symmetrical structure, typically indicates an upcoming upward trend.
        2. Double Bottom: Two similar low points with a rebound in between, forming a 'W' shape.
        3. Rounded Bottom: Gradual price decline followed by a gradual rise, forming a 'U' shape.
        4. Hidden Base: Horizontal consolidation followed by a sudden upward breakout.
        5. Falling Wedge: Price narrows downward, usually breaks out upward.
        6. Rising Wedge: Price rises slowly but converges, often breaks down.
        7. Ascending Triangle: Rising support line with a flat resistance on top, breakout often occurs upward.
        8. Descending Triangle: Falling resistance line with flat support at the bottom, typically breaks down.
        9. Bullish Flag: After a sharp rise, price consolidates downward briefly before continuing upward.
        10. Bearish Flag: After a sharp drop, price consolidates upward briefly before continuing downward.
        11. Rectangle: Price fluctuates between horizontal support and resistance.
        12. Island Reversal: Two price gaps in opposite directions forming an isolated price island.
        13. V-shaped Reversal: Sharp decline followed by sharp recovery, or vice versa.
        14. Rounded Top / Rounded Bottom: Gradual peaking or bottoming, forming an arc-shaped pattern.
        15. Expanding Triangle: Highs and lows increasingly wider, indicating volatile swings.
        16. Symmetrical Triangle: Highs and lows converge toward the apex, usually followed by a breakout.
        """.strip()


def _run_indicator_prompt(llm, kline_data: Dict[str, list], time_frame: str, indicator_values_json: str) -> str:
    system_text = (
        "You are a high-frequency trading (HFT) analyst assistant operating under time-sensitive conditions. "
        "You must analyze technical indicators to support fast-paced trading execution.\n\n"
        "You have access to tools: compute_rsi, compute_macd, compute_roc, compute_stoch, and compute_willr. "
        "Use them by providing appropriate arguments like `kline_data` and the respective periods.\n\n"
        f"⚠️ The OHLC data provided is from a {time_frame} intervals, reflecting recent market behavior. "
        "You must interpret this data quickly and accurately.\n\n"
        f"Here is the OHLC data:\n{json.dumps(kline_data, indent=2)}.\n\n"
        "Call necessary tools, and analyze the results.\n"
    )
    user_text = (
        "Begin indicator analysis.\n\n"
        "Supplementary precomputed indicator values:\n"
        f"{indicator_values_json}"
    )
    res = llm.invoke(
        [
            SystemMessage(content=system_text),
            HumanMessage(content=user_text),
        ]
    )
    content = getattr(res, "content", "")
    return content if isinstance(content, str) else str(content)


def _run_pattern_prompt(llm, time_frame: str, pattern_image_path: Path) -> str:
    pattern_text = _build_pattern_prompt_text()
    image_prompt = [
        {
            "type": "text",
            "text": (
                f"This is a {time_frame} candlestick chart generated from recent OHLC market data.\n\n"
                f"{pattern_text}\n\n"
                "Determine whether the chart matches any of the patterns listed. "
                "Clearly name the matched pattern(s), and explain your reasoning based on structure, trend, and symmetry."
            ),
        },
        {
            "type": "image_url",
            "image_url": {"url": _to_data_url(pattern_image_path)},
        },
    ]
    res = llm.invoke(
        [
            SystemMessage(content="You are a trading pattern recognition assistant tasked with analyzing candlestick charts."),
            HumanMessage(content=image_prompt),
        ]
    )
    content = getattr(res, "content", "")
    return content if isinstance(content, str) else str(content)


def _run_trend_prompt(llm, time_frame: str, trend_image_path: Path) -> str:
    image_prompt = [
        {
            "type": "text",
            "text": (
                f"This candlestick ({time_frame} K-line) chart includes automated trendlines: the **blue line** is support, and the **red line** is resistance, both derived from recent closing prices.\n\n"
                "Analyze how price interacts with these lines — are candles bouncing off, breaking through, or compressing between them?\n\n"
                "Based on trendline slope, spacing, and recent K-line behavior, predict the likely short-term trend: **upward**, **downward**, or **sideways**. "
                "Support your prediction with respect to prediction, reasoning, signals."
            ),
        },
        {
            "type": "image_url",
            "image_url": {"url": _to_data_url(trend_image_path)},
        },
    ]
    res = llm.invoke(
        [
            SystemMessage(
                content="You are a K-line trend pattern recognition assistant operating in a high-frequency trading context. "
                "Your task is to analyze candlestick charts annotated with support and resistance trendlines."
            ),
            HumanMessage(content=image_prompt),
        ]
    )
    content = getattr(res, "content", "")
    return content if isinstance(content, str) else str(content)


def _build_final_decision(llm, stock_name: str, time_frame: str, indicator_report: str, pattern_report: str, trend_report: str) -> str:
    prompt = f"""You are a high-frequency quantitative trading (HFT) analyst operating on the current {time_frame} K-line chart for {stock_name}. Your task is to issue an **immediate execution order**: **LONG** or **SHORT**. ⚠️ HOLD is prohibited due to HFT constraints.

            Your decision should forecast the market move over the **next N candlesticks**, where:
            - For example: TIME_FRAME = 15min, N = 1 → Predict the next 15 minutes.
            - TIME_FRAME = 4hour, N = 1 → Predict the next 4 hours.

            Base your decision on the combined strength, alignment, and timing of the following three reports:

            ---

            ### 1. Technical Indicator Report:
            - Evaluate momentum (e.g., MACD, ROC) and oscillators (e.g., RSI, Stochastic, Williams %R).
            - Give **higher weight to strong directional signals** such as MACD crossovers, RSI divergence, extreme overbought/oversold levels.
            - **Ignore or down-weight neutral or mixed signals** unless they align across multiple indicators.

            ---

            ### 2. Pattern Report:
            - Only act on bullish or bearish patterns if:
            - The pattern is **clearly recognizable and mostly complete**, and
            - A **breakout or breakdown is already underway** or highly probable based on price and momentum (e.g., strong wick, volume spike, engulfing candle).
            - **Do NOT act** on early-stage or speculative patterns. Do not treat consolidating setups as tradable unless there is **breakout confirmation** from other reports.

            ---

            ### 3. Trend Report:
            - Analyze how price interacts with support and resistance:
            - An **upward sloping support line** suggests buying interest.
            - A **downward sloping resistance line** suggests selling pressure.
            - If price is compressing between trendlines:
            - Predict breakout **only when confluence exists with strong candles or indicator confirmation**.
            - **Do NOT assume breakout direction** from geometry alone.

            ---

            ### ✅ Decision Strategy

            1. Only act on **confirmed** signals — avoid emerging, speculative, or conflicting signals.
            2. Prioritize decisions where **all three reports** (Indicator, Pattern, and Trend) **align in the same direction**.
            3. Give more weight to:
            - Recent strong momentum (e.g., MACD crossover, RSI breakout)
            - Decisive price action (e.g., breakout candle, rejection wicks, support bounce)
            4. If reports disagree:
            - Choose the direction with **stronger and more recent confirmation**
            - Prefer **momentum-backed signals** over weak oscillator hints.
            5. ⚖️ If the market is in consolidation or reports are mixed:
            - Default to the **dominant trendline slope** (e.g., SHORT in descending channel).
            - Do not guess direction — choose the **more defensible** side.
            6. Suggest a reasonable **risk-reward ratio** between **1.2 and 1.8**, based on current volatility and trend strength.

            ---
            ### 🧠 Output Format in json(for system parsing):

            ```
            {{
            "forecast_horizon": "Predicting next 3 candlestick (15 minutes, 1 hour, etc.)",
            "decision": "<LONG or SHORT>",
            "justification": "<Concise, confirmed reasoning based on reports>",
            "risk_reward_ratio": "<float between 1.2 and 1.8>",
            }}

            --------
            **Technical Indicator Report**  
            {indicator_report}

            **Pattern Report**  
            {pattern_report}

            **Trend Report**  
            {trend_report}

        """

    res = llm.invoke(prompt)
    content = getattr(res, "content", "")
    return content if isinstance(content, str) else str(content)


def create_quant_analyst(llm):
    """Standalone quant analyst fully implemented inside TradingAgents."""

    def quant_analyst_node(state):
        ticker = state["company_of_interest"]
        trade_date = state["trade_date"]
        timeframe = str(state.get("timeframe", "1d") or "1d")
        end_date = str(state.get("end_date", trade_date) or trade_date)
        start_date = str(state.get("start_date", "") or "")
        if not start_date:
            dt = datetime.strptime(end_date, "%Y-%m-%d")
            start_date = (dt - timedelta(days=140)).strftime("%Y-%m-%d")

        time_frame = timeframe
        try:
            df = _fetch_ohlc_df(
                ticker=ticker,
                start_date=start_date,
                end_date=end_date,
                interval=timeframe,
            )
            kline_data = _df_to_kline_data(df)
            ind = _compute_indicators(df)

            report_dir = _get_report_dir(ticker, trade_date)
            pattern_path = report_dir / "quant_pattern.png"
            trend_path = report_dir / "quant_trend.png"
            df.to_csv(report_dir / "quant_record.csv", index=False)
            _draw_pattern_image(df, pattern_path)
            _ = _draw_trend_image(df, trend_path)

            indicator_report = _run_indicator_prompt(
                llm=llm,
                kline_data=kline_data,
                time_frame=time_frame,
                indicator_values_json=_indicator_values_json(ind),
            )
            pattern_report = _run_pattern_prompt(
                llm=llm,
                time_frame=time_frame,
                pattern_image_path=pattern_path,
            )
            trend_report = _run_trend_prompt(
                llm=llm,
                time_frame=time_frame,
                trend_image_path=trend_path,
            )
            final_decision = _build_final_decision(
                llm=llm,
                stock_name=ticker,
                time_frame=time_frame,
                indicator_report=indicator_report,
                pattern_report=pattern_report,
                trend_report=trend_report,
            )

            report = (
                f"## QuantAgent Composite Report ({ticker})\n\n"
                f"### Indicator Agent\n{indicator_report}\n\n"
                f"### Pattern Agent\n{pattern_report}\n\n"
                f"### Trend Agent\n{trend_report}\n\n"
                f"### Quant Decision Agent\n{final_decision}"
            )
            return {"messages": [AIMessage(content=report)], "quant_report": report}
        except Exception as e:
            report = f"Quant analyst fallback: failed for {ticker}. Reason: {e}"
            return {"messages": [AIMessage(content=report)], "quant_report": report}

    return quant_analyst_node
