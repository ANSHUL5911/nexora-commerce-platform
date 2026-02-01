import { useState } from 'react';
import { Chatbot } from 'supersimpledev';
import loadingSpinner from '../assets/loading-spinner.gif';
import './ChatInput.css';


export function ChatInput({ chatMessages, setChatMessages }) {
    const [inputText, setInputText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
  
  
    function saveInputText(event) {
        setInputText(event.target.value);
    }
  
    async function sendMessage() {
        const trimmed = inputText.trim();
        if (isLoading || trimmed === '') {
            return;
        }
  
        // Use the current text for this send, then clear the input UI.
        setIsLoading(true);
        setInputText('');
  
        const newChatMessages = [
            ...chatMessages,
            {
                message: trimmed,
                sender: 'user',
                id: crypto.randomUUID()
            }
        ];
  
        // Temporary loading message (removed when we set the response).
        setChatMessages([
            ...newChatMessages,
            {
                message: <img src={loadingSpinner} className="loading-spinner" />,
                sender: 'robot',
                id: crypto.randomUUID()
            }
        ]);
  
        const response = await Chatbot.getResponseAsync(trimmed);
        setChatMessages([
            ...newChatMessages,
            {
                message: response,
                sender: 'robot',
                id: crypto.randomUUID()
            }
        ]);
  
        setIsLoading(false);
    }
  
    function handleKeyDown(event) {
  
        if (event.key === 'Enter') {
            sendMessage();
        }
  
        else if (event.key === 'Escape') {
            setInputText('');
        }
    }
  
  
    return (
        <div className="chat-input-container">
            <input
                type="text"
                placeholder="Send a message to Chatbot"
                size="50"
                onChange={saveInputText}
                onKeyDown={handleKeyDown}
                value={inputText}
                className="chat-input"
            />
            <button
                onClick={sendMessage}
                className="send-button"
            >Send</button>
        </div>
    );
  }