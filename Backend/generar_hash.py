import bcrypt

PASSWORD = "admin1234"

if __name__ == "__main__":
    hashed = bcrypt.hashpw(PASSWORD.encode(), bcrypt.gensalt(rounds=12)).decode()
    print(hashed)
