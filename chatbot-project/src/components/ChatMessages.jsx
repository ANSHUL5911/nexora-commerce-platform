import { useRef, useEffect } from 'react';
import { ChatMessage } from './ChatMessage';
import './ChatMessages.css';



function useAutoScroll(chatMessages) {
    // It's highly recommend to rename this to something
    // more generic like containerRef. This will make the
    // code make more sense if we ever reuse this code in
    // other components.
    const containerRef = useRef(null);
  
    useEffect(() => {
        const containerElem = containerRef.current;
        if(containerElem){
            containerElem.scrollTop = containerElem.scrollHeight;
        }
    }, [chatMessages]);
  
    return containerRef;
  }
  
  function ChatMessages({ chatMessages }) {
    const chatMessagesRef = useAutoScroll(chatMessages);
    return (
        <div className="chat-messages-container" ref={chatMessagesRef}>
  
            {chatMessages.map((chatMessage) => {
                return (
                    <ChatMessage
                        message={chatMessage.message}
                        sender={chatMessage.sender}
                        key={chatMessage.id}
                    />
                );
            })}
        </div>
    );
  
  }

  export default ChatMessages;