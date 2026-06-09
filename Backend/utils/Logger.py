import logging
import os
import traceback

class Logger():

    _logger = None

    @classmethod
    def _set_logger(cls):
        log_directory = 'utils/logs'
        log_filename = 'app.log'

        if cls._logger is not None:
            return cls._logger

        logger = logging.getLogger(__name__)
        logger.setLevel(logging.DEBUG)

        os.makedirs(log_directory, exist_ok=True)

        log_path = os.path.join(log_directory, log_filename)
        file_handler = logging.FileHandler(log_path, encoding='utf-8')
        file_handler.setLevel(logging.DEBUG)

        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.DEBUG)

        formatter = logging.Formatter('%(asctime)s | %(levelname)s | %(message)s', "%Y-%m-%d %H:%M:%S")
        file_handler.setFormatter(formatter)
        console_handler.setFormatter(formatter)

        if logger.hasHandlers():
            logger.handlers.clear()

        logger.addHandler(file_handler)
        logger.addHandler(console_handler)
        cls._logger = logger

        return logger
    
    @classmethod
    def add_to_log(cls, level, message):
        try:
            logger = cls._set_logger()

            if level == "critical":
                logger.critical(message)
            elif level == "debug":
                logger.debug(message)
            elif level == "error":
                logger.error(message)
            elif level == "info":
                logger.info(message)
            elif level == "warn":
                logger.warning(message)
        except Exception as ex:
            print(traceback.format_exc())
            print(ex)