from workers import scheduler


def test_build_scheduler_registers_all_four_jobs():
    pool = object()  # not connected to; job functions aren't invoked by registering them
    sched = scheduler.build_scheduler(pool, {"supported_languages": ["en"]},
                                       {"denylist_patterns": [], "max_tokens": 256})
    job_funcs = {job.func.__name__ for job in sched.get_jobs()}
    assert job_funcs == {"run_tick", "_run_maintenance_job", "_run_baseline_job", "_run_ratings_sync_job"}
    # sched was never started (build_scheduler only registers jobs), so there's nothing to
    # shut down — calling shutdown() here raises SchedulerNotRunningError.
