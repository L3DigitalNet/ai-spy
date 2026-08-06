import pytest

from ai_spy import main


def test_main_greets_on_stdout(capsys: pytest.CaptureFixture[str]) -> None:
    main()

    assert capsys.readouterr().out == "Hello from ai-spy!\n"
