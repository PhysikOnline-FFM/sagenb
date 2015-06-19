from sqlalchemy import Column, Integer, DateTime, Text, String
from sqlalchemy.ext.declarative import declarative_base
import datetime
#from sqlalchemy.dialects.postgresql import *

Base = declarative_base()

class Chatlog_entry(Base):
    __tablename__ = 'chatlog'

    id = Column(Integer, primary_key=True)
    wsid = Column(String(100))
    userid = Column(String(100))
    time = Column(DateTime)
    msg = Column(Text)

    def __init__(self, msg, userid, nickname, wsid):
        self.msg = msg
        self.userid = userid
        self.wsid = wsid
        self.time = datetime.datetime.now()

    def __repr__(self):
        return '{}: "{}"'.format(self.userid, self.msg)

def init_db(engine):
    Base.metadata.create_all(engine)
