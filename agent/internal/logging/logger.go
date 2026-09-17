package logging

import (
	"fmt"
	"log"
	"os"
	"sync"
	"time"
)

type LogEntry struct {
	Level     string    `json:"level"`
	Message   string    `json:"message"`
	Timestamp time.Time `json:"timestamp"`
}

type Logger struct {
	mu     sync.Mutex
	buffer []LogEntry
	logger *log.Logger
}

func NewLogger() *Logger {
	return &Logger{
		buffer: make([]LogEntry, 0),
		logger: log.New(os.Stdout, "[MAPT-AGENT] ", log.LstdFlags),
	}
}

func (l *Logger) Info(format string, v ...interface{}) {
	msg := fmt.Sprintf(format, v...)
	l.logger.Printf("[INFO] %s", msg)
	l.append("INFO", msg)
}

func (l *Logger) Error(format string, v ...interface{}) {
	msg := fmt.Sprintf(format, v...)
	l.logger.Printf("[ERROR] %s", msg)
	l.append("ERROR", msg)
}

func (l *Logger) Debug(format string, v ...interface{}) {
	msg := fmt.Sprintf(format, v...)
	l.logger.Printf("[DEBUG] %s", msg)
	l.append("DEBUG", msg)
}

func (l *Logger) Warn(format string, v ...interface{}) {
	msg := fmt.Sprintf(format, v...)
	l.logger.Printf("[WARN] %s", msg)
	l.append("WARNING", msg)
}

func (l *Logger) append(level, msg string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.buffer = append(l.buffer, LogEntry{
		Level:     level,
		Message:   msg,
		Timestamp: time.Now().UTC(),
	})
	if len(l.buffer) > 500 {
		l.buffer = l.buffer[len(l.buffer)-500:]
	}
}

func (l *Logger) FlushBuffer() []LogEntry {
	l.mu.Lock()
	defer l.mu.Unlock()
	entries := make([]LogEntry, len(l.buffer))
	copy(entries, l.buffer)
	l.buffer = l.buffer[:0]
	return entries
}
